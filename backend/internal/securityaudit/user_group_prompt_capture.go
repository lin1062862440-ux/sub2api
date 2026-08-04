package securityaudit

import (
	"context"
	"errors"
	"log/slog"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const userGroupPromptEligibilityChannel = "sub2api:user_group_prompt:eligibility:invalidate"

type promptCaptureOptions struct {
	QueueCapacity    int
	Workers          int
	PersistenceTries int
	RetryDelay       time.Duration
	CleanupInterval  time.Duration
	CleanupBatch     int
	ReconcileEvery   time.Duration
	Now              func() time.Time
}

func defaultPromptCaptureOptions() promptCaptureOptions {
	return promptCaptureOptions{
		QueueCapacity: 2048, Workers: 2, PersistenceTries: 3, RetryDelay: 50 * time.Millisecond,
		CleanupInterval: time.Hour, CleanupBatch: 1000, ReconcileEvery: time.Minute, Now: time.Now,
	}
}

type userPromptCaptureTask struct {
	request    Request
	groupIDs   []int64
	eventID    string
	capturedAt time.Time
}

type userGroupPromptCaptureMetrics struct {
	enqueued       atomic.Int64
	skipped        atomic.Int64
	dropped        atomic.Int64
	parseFailed    atomic.Int64
	persisted      atomic.Int64
	persistFailed  atomic.Int64
	cleanupDeleted atomic.Int64
	cleanupFailed  atomic.Int64
}

type UserGroupPromptCaptureService struct {
	repo    service.UserGroupPromptCaptureRepository
	redis   *redis.Client
	options promptCaptureOptions
	queue   chan userPromptCaptureTask

	eligibility atomic.Value
	accepting   atomic.Bool
	metrics     userGroupPromptCaptureMetrics

	startOnce sync.Once
	stopOnce  sync.Once
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

func NewUserGroupPromptCaptureService(repo service.UserGroupPromptCaptureRepository, redisClient *redis.Client) *UserGroupPromptCaptureService {
	return newUserGroupPromptCaptureService(repo, redisClient, defaultPromptCaptureOptions())
}

func newUserGroupPromptCaptureService(repo service.UserGroupPromptCaptureRepository, redisClient *redis.Client, options promptCaptureOptions) *UserGroupPromptCaptureService {
	defaults := defaultPromptCaptureOptions()
	if options.QueueCapacity <= 0 {
		options.QueueCapacity = defaults.QueueCapacity
	}
	if options.Workers < 0 {
		options.Workers = defaults.Workers
	}
	if options.PersistenceTries <= 0 {
		options.PersistenceTries = defaults.PersistenceTries
	}
	if options.RetryDelay <= 0 {
		options.RetryDelay = defaults.RetryDelay
	}
	if options.CleanupInterval <= 0 {
		options.CleanupInterval = defaults.CleanupInterval
	}
	if options.CleanupBatch <= 0 {
		options.CleanupBatch = defaults.CleanupBatch
	}
	if options.ReconcileEvery <= 0 {
		options.ReconcileEvery = defaults.ReconcileEvery
	}
	if options.Now == nil {
		options.Now = defaults.Now
	}
	svc := &UserGroupPromptCaptureService{repo: repo, redis: redisClient, options: options, queue: make(chan userPromptCaptureTask, options.QueueCapacity)}
	svc.eligibility.Store(map[int64][]int64{})
	svc.accepting.Store(true)
	return svc
}

func (s *UserGroupPromptCaptureService) Start(parent context.Context) error {
	if s == nil || s.repo == nil {
		return errors.New("user group prompt capture repository unavailable")
	}
	if err := s.RefreshEligibility(parent); err != nil {
		return err
	}
	var startErr error
	s.startOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		s.cancel = cancel
		for index := 0; index < s.options.Workers; index++ {
			s.wg.Add(1)
			go s.runWorker(ctx)
		}
		s.wg.Add(1)
		go s.runMaintenance(ctx)
		if s.redis != nil {
			s.wg.Add(1)
			go s.runInvalidationSubscriber(ctx)
		}
	})
	return startErr
}

func (s *UserGroupPromptCaptureService) Dispatch(request Request) {
	if s == nil || !s.accepting.Load() || request.UserID <= 0 {
		return
	}
	eligibility, _ := s.eligibility.Load().(map[int64][]int64)
	groupIDs := append([]int64(nil), eligibility[request.UserID]...)
	if len(groupIDs) == 0 {
		s.metrics.skipped.Add(1)
		return
	}
	task := userPromptCaptureTask{request: request.Clone(), groupIDs: groupIDs, eventID: uuid.NewString(), capturedAt: s.options.Now().UTC()}
	select {
	case s.queue <- task:
		s.metrics.enqueued.Add(1)
	default:
		s.metrics.dropped.Add(1)
	}
}

func (s *UserGroupPromptCaptureService) RefreshEligibility(ctx context.Context) error {
	if s == nil || s.repo == nil {
		return errors.New("user group prompt capture repository unavailable")
	}
	loaded, err := s.repo.LoadEligibility(ctx)
	if err != nil {
		return err
	}
	normalized := make(map[int64][]int64, len(loaded))
	for userID, groupIDs := range loaded {
		normalized[userID] = canonicalCaptureGroupIDs(groupIDs)
	}
	s.eligibility.Store(normalized)
	return nil
}

func (s *UserGroupPromptCaptureService) PublishEligibilityInvalidation(ctx context.Context) error {
	if s == nil || s.redis == nil {
		return nil
	}
	return s.redis.Publish(ctx, userGroupPromptEligibilityChannel, "refresh").Err()
}

func (s *UserGroupPromptCaptureService) Stop(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.accepting.Store(false)
	s.stopOnce.Do(func() {
		if s.cancel != nil {
			s.cancel()
		}
	})
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *UserGroupPromptCaptureService) runWorker(ctx context.Context) {
	defer s.wg.Done()
	for {
		select {
		case task := <-s.queue:
			s.processTask(ctx, task)
		case <-ctx.Done():
			for {
				select {
				case task := <-s.queue:
					s.processTask(context.Background(), task)
				default:
					return
				}
			}
		}
	}
}

func (s *UserGroupPromptCaptureService) processTask(ctx context.Context, task userPromptCaptureTask) {
	prompt, err := ExtractLatestUserPromptSnapshot(task.request)
	task.request.Body = nil
	if err != nil {
		s.metrics.parseFailed.Add(1)
		return
	}
	write := service.UserPromptCaptureWrite{
		EventID: task.eventID, RequestID: task.request.RequestID, UserID: task.request.UserID,
		Protocol: task.request.Protocol, Model: task.request.Model, Stage: normalizeStage(task.request.Stage),
		RedactedPrompt: prompt.RedactedPrompt, PromptHash: prompt.PromptHash, PromptLength: prompt.PromptLength,
		Truncated: prompt.Truncated, GroupIDs: task.groupIDs, CapturedAt: task.capturedAt,
		ExpiresAt: task.capturedAt.Add(service.UserGroupPromptStagingRetention),
	}
	for attempt := 1; attempt <= s.options.PersistenceTries; attempt++ {
		if err := s.repo.InsertCapture(ctx, write); err == nil {
			s.metrics.persisted.Add(1)
			return
		} else if attempt == s.options.PersistenceTries {
			s.metrics.persistFailed.Add(1)
			slog.Warn("user_group_prompt_capture.persist_failed", "event_id", task.eventID, "request_id", task.request.RequestID, "user_id", task.request.UserID, "attempts", attempt)
			return
		}
		select {
		case <-ctx.Done():
			s.metrics.persistFailed.Add(1)
			return
		case <-time.After(s.options.RetryDelay):
		}
	}
}

func (s *UserGroupPromptCaptureService) runMaintenance(ctx context.Context) {
	defer s.wg.Done()
	_ = s.cleanupOnce(ctx)
	cleanupTicker := time.NewTicker(s.options.CleanupInterval)
	reconcileTicker := time.NewTicker(s.options.ReconcileEvery)
	defer cleanupTicker.Stop()
	defer reconcileTicker.Stop()
	for {
		select {
		case <-cleanupTicker.C:
			_ = s.cleanupOnce(ctx)
		case <-reconcileTicker.C:
			if err := s.RefreshEligibility(ctx); err != nil {
				slog.Warn("user_group_prompt_capture.eligibility_refresh_failed", "error", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (s *UserGroupPromptCaptureService) cleanupOnce(ctx context.Context) error {
	for batch := 0; batch < 10; batch++ {
		deleted, err := s.repo.DeleteExpiredBatch(ctx, s.options.Now().UTC(), s.options.CleanupBatch)
		if err != nil {
			s.metrics.cleanupFailed.Add(1)
			return err
		}
		s.metrics.cleanupDeleted.Add(deleted)
		if deleted < int64(s.options.CleanupBatch) {
			return nil
		}
	}
	return nil
}

func (s *UserGroupPromptCaptureService) runInvalidationSubscriber(ctx context.Context) {
	defer s.wg.Done()
	pubsub := s.redis.Subscribe(ctx, userGroupPromptEligibilityChannel)
	defer func() { _ = pubsub.Close() }()
	channel := pubsub.Channel()
	for {
		select {
		case _, ok := <-channel:
			if !ok {
				return
			}
			if err := s.RefreshEligibility(ctx); err != nil {
				slog.Warn("user_group_prompt_capture.invalidation_refresh_failed", "error", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func canonicalCaptureGroupIDs(values []int64) []int64 {
	set := make(map[int64]struct{}, len(values))
	for _, value := range values {
		if value > 0 {
			set[value] = struct{}{}
		}
	}
	result := make([]int64, 0, len(set))
	for value := range set {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

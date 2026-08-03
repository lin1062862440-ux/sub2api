package securityaudit

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

type promptCaptureRepositoryStub struct {
	mu          sync.Mutex
	eligibility map[int64][]int64
	writes      []service.UserPromptCaptureWrite
	inserted    chan struct{}
	insertErr   error
	deleteCount int64
}

func (s *promptCaptureRepositoryStub) LoadEligibility(context.Context) (map[int64][]int64, error) {
	result := make(map[int64][]int64, len(s.eligibility))
	for userID, groupIDs := range s.eligibility {
		result[userID] = append([]int64(nil), groupIDs...)
	}
	return result, nil
}
func (s *promptCaptureRepositoryStub) SetCaptureEnabled(context.Context, int64, bool) error {
	return nil
}
func (s *promptCaptureRepositoryStub) ListPromptViewers(context.Context, int64) ([]service.UserGroupViewer, error) {
	return nil, nil
}
func (s *promptCaptureRepositoryStub) ReplacePromptViewers(context.Context, int64, []int64, int64) error {
	return nil
}
func (s *promptCaptureRepositoryStub) CanViewPrompt(context.Context, int64, int64) (bool, error) {
	return false, nil
}
func (s *promptCaptureRepositoryStub) InsertCapture(_ context.Context, capture service.UserPromptCaptureWrite) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.insertErr != nil {
		return s.insertErr
	}
	s.writes = append(s.writes, capture)
	if s.inserted != nil {
		select {
		case s.inserted <- struct{}{}:
		default:
		}
	}
	return nil
}
func (s *promptCaptureRepositoryStub) PromptAvailableForUsage(context.Context, int64, int64) (bool, error) {
	return false, nil
}
func (s *promptCaptureRepositoryStub) ListUsagePrompts(context.Context, int64, int64) ([]service.UserPromptCaptureDetail, error) {
	return nil, nil
}
func (s *promptCaptureRepositoryStub) DeleteExpiredBatch(context.Context, time.Time, int) (int64, error) {
	return s.deleteCount, nil
}

func TestUserGroupPromptCaptureDispatchesEligibleRequestAsynchronously(t *testing.T) {
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	repo := &promptCaptureRepositoryStub{eligibility: map[int64][]int64{7: {5, 2, 5}}, inserted: make(chan struct{}, 1)}
	svc := newUserGroupPromptCaptureService(repo, nil, promptCaptureOptions{QueueCapacity: 4, Workers: 1, Now: func() time.Time { return now }, RetryDelay: time.Millisecond})
	require.NoError(t, svc.Start(context.Background()))
	t.Cleanup(func() { _ = svc.Stop(context.Background()) })

	svc.Dispatch(Request{RequestID: "req-1", UserID: 7, Protocol: "anthropic_messages", Model: "claude", Body: []byte(`{"messages":[{"role":"user","content":"old"},{"role":"user","content":"latest alice@example.com"}]}`)})

	select {
	case <-repo.inserted:
	case <-time.After(time.Second):
		t.Fatal("capture worker did not persist task")
	}
	repo.mu.Lock()
	require.Len(t, repo.writes, 1)
	write := repo.writes[0]
	repo.mu.Unlock()
	require.Equal(t, []int64{2, 5}, write.GroupIDs)
	require.Contains(t, write.RedactedPrompt, "latest")
	require.NotContains(t, write.RedactedPrompt, "old")
	require.NotContains(t, write.RedactedPrompt, "alice@example.com")
	require.Equal(t, now, write.CapturedAt)
	require.Equal(t, now.Add(service.UserGroupPromptRetention), write.ExpiresAt)
}

func TestUserGroupPromptCaptureSkipsIneligibleAndDropsFullQueue(t *testing.T) {
	repo := &promptCaptureRepositoryStub{eligibility: map[int64][]int64{7: {2}}}
	svc := newUserGroupPromptCaptureService(repo, nil, promptCaptureOptions{QueueCapacity: 1, Workers: 0, Now: time.Now})
	require.NoError(t, svc.RefreshEligibility(context.Background()))

	svc.Dispatch(Request{UserID: 9, Body: []byte(`{"input":"skip"}`)})
	require.Equal(t, int64(1), svc.metrics.skipped.Load())
	svc.Dispatch(Request{UserID: 7, Body: []byte(`{"input":"first"}`)})
	svc.Dispatch(Request{UserID: 7, Body: []byte(`{"input":"second"}`)})
	require.Equal(t, int64(1), svc.metrics.dropped.Load())
}

func TestUserGroupPromptCaptureCleanupUsesBoundedBatches(t *testing.T) {
	repo := &promptCaptureRepositoryStub{deleteCount: 0}
	svc := newUserGroupPromptCaptureService(repo, nil, promptCaptureOptions{QueueCapacity: 1, Workers: 0, Now: time.Now})
	require.NoError(t, svc.cleanupOnce(context.Background()))
	require.Equal(t, int64(0), svc.metrics.cleanupDeleted.Load())
}

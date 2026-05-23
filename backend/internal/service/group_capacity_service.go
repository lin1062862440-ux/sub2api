package service

import (
	"context"
	"fmt"
	"math"
	"time"
)

// GroupCapacitySummary holds aggregated capacity for a single group.
type GroupCapacitySummary struct {
	GroupID         int64 `json:"group_id"`
	ConcurrencyUsed int   `json:"concurrency_used"`
	ConcurrencyMax  int   `json:"concurrency_max"`
	SessionsUsed    int   `json:"sessions_used"`
	SessionsMax     int   `json:"sessions_max"`
	RPMUsed         int   `json:"rpm_used"`
	RPMMax          int   `json:"rpm_max"`
}

// GroupCodexQuotaSummary holds equal-weight Codex quota usage for one group.
// Each account contributes one capacity unit; accounts with missing or expired
// snapshots are excluded from the average and reported separately.
type GroupCodexQuotaSummary struct {
	GroupID      int64                 `json:"group_id"`
	AccountCount int                   `json:"account_count"`
	FiveHour     GroupCodexQuotaWindow `json:"five_hour"`
	SevenDay     GroupCodexQuotaWindow `json:"seven_day"`
}

// GroupCodexQuotaWindow describes one Codex quota window.
type GroupCodexQuotaWindow struct {
	UsedPercent      float64    `json:"used_percent"`
	RemainingPercent float64    `json:"remaining_percent"`
	SampledAccounts  int        `json:"sampled_accounts"`
	MissingAccounts  int        `json:"missing_accounts"`
	ExpiredAccounts  int        `json:"expired_accounts"`
	NextResetAt      *time.Time `json:"next_reset_at,omitempty"`
}

// GroupCapacityService aggregates per-group capacity from runtime data.
type GroupCapacityService struct {
	accountRepo        AccountRepository
	groupRepo          GroupRepository
	concurrencyService *ConcurrencyService
	sessionLimitCache  SessionLimitCache
	rpmCache           RPMCache
}

// NewGroupCapacityService creates a new GroupCapacityService.
func NewGroupCapacityService(
	accountRepo AccountRepository,
	groupRepo GroupRepository,
	concurrencyService *ConcurrencyService,
	sessionLimitCache SessionLimitCache,
	rpmCache RPMCache,
) *GroupCapacityService {
	return &GroupCapacityService{
		accountRepo:        accountRepo,
		groupRepo:          groupRepo,
		concurrencyService: concurrencyService,
		sessionLimitCache:  sessionLimitCache,
		rpmCache:           rpmCache,
	}
}

// GetAllGroupCodexQuota returns equal-weight Codex 5h/7d usage for all active groups.
func (s *GroupCapacityService) GetAllGroupCodexQuota(ctx context.Context) ([]GroupCodexQuotaSummary, error) {
	groups, err := s.groupRepo.ListActive(ctx)
	if err != nil {
		return nil, err
	}

	results := make([]GroupCodexQuotaSummary, 0, len(groups))
	for i := range groups {
		summary, err := s.getGroupCodexQuota(ctx, groups[i].ID)
		if err != nil {
			continue
		}
		results = append(results, summary)
	}
	return results, nil
}

func (s *GroupCapacityService) getGroupCodexQuota(ctx context.Context, groupID int64) (GroupCodexQuotaSummary, error) {
	accounts, err := s.accountRepo.ListByGroup(ctx, groupID)
	if err != nil {
		return GroupCodexQuotaSummary{}, err
	}

	now := time.Now()
	summary := GroupCodexQuotaSummary{
		GroupID:      groupID,
		AccountCount: len(accounts),
	}
	summary.FiveHour = aggregateCodexQuotaWindow(accounts, "5h", now)
	summary.SevenDay = aggregateCodexQuotaWindow(accounts, "7d", now)
	return summary, nil
}

func aggregateCodexQuotaWindow(accounts []Account, window string, now time.Time) GroupCodexQuotaWindow {
	var totalUsed float64
	var sampled, missing, expired int
	var nextReset *time.Time

	for i := range accounts {
		if codexQuotaSnapshotExpired(accounts[i].Extra, window, now) {
			expired++
			continue
		}
		progress := buildCodexUsageProgressFromExtra(accounts[i].Extra, window, now)
		if progress == nil {
			missing++
			continue
		}
		if progress.ResetsAt != nil && !now.Before(*progress.ResetsAt) {
			expired++
			continue
		}
		sampled++
		totalUsed += clampPercent(progress.Utilization)
		if progress.ResetsAt != nil && (nextReset == nil || progress.ResetsAt.Before(*nextReset)) {
			reset := progress.ResetsAt.UTC()
			nextReset = &reset
		}
	}

	if sampled == 0 {
		return GroupCodexQuotaWindow{
			MissingAccounts: missing,
			ExpiredAccounts: expired,
		}
	}

	used := roundPercent(totalUsed / float64(sampled))
	return GroupCodexQuotaWindow{
		UsedPercent:      used,
		RemainingPercent: roundPercent(100 - used),
		SampledAccounts:  sampled,
		MissingAccounts:  missing,
		ExpiredAccounts:  expired,
		NextResetAt:      nextReset,
	}
}

func codexQuotaSnapshotExpired(extra map[string]any, window string, now time.Time) bool {
	if len(extra) == 0 {
		return false
	}
	var resetAtKey string
	switch window {
	case "5h":
		resetAtKey = "codex_5h_reset_at"
	case "7d":
		resetAtKey = "codex_7d_reset_at"
	default:
		return false
	}
	raw, ok := extra[resetAtKey]
	if !ok {
		return false
	}
	resetAt, err := parseTime(fmt.Sprint(raw))
	if err != nil {
		return false
	}
	return !now.Before(resetAt)
}

func clampPercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func roundPercent(v float64) float64 {
	return math.Round(v*10) / 10
}

// GetAllGroupCapacity returns capacity summary for all active groups.
func (s *GroupCapacityService) GetAllGroupCapacity(ctx context.Context) ([]GroupCapacitySummary, error) {
	groups, err := s.groupRepo.ListActive(ctx)
	if err != nil {
		return nil, err
	}

	results := make([]GroupCapacitySummary, 0, len(groups))
	for i := range groups {
		cap, err := s.getGroupCapacity(ctx, groups[i].ID)
		if err != nil {
			// Skip groups with errors, return partial results
			continue
		}
		cap.GroupID = groups[i].ID
		results = append(results, cap)
	}
	return results, nil
}

func (s *GroupCapacityService) getGroupCapacity(ctx context.Context, groupID int64) (GroupCapacitySummary, error) {
	accounts, err := s.accountRepo.ListSchedulableByGroupID(ctx, groupID)
	if err != nil {
		return GroupCapacitySummary{}, err
	}
	if len(accounts) == 0 {
		return GroupCapacitySummary{}, nil
	}

	// Collect account IDs and config values
	accountIDs := make([]int64, 0, len(accounts))
	sessionTimeouts := make(map[int64]time.Duration)
	var concurrencyMax, sessionsMax, rpmMax int

	for i := range accounts {
		acc := &accounts[i]
		accountIDs = append(accountIDs, acc.ID)
		concurrencyMax += acc.Concurrency

		if ms := acc.GetMaxSessions(); ms > 0 {
			sessionsMax += ms
			timeout := time.Duration(acc.GetSessionIdleTimeoutMinutes()) * time.Minute
			if timeout <= 0 {
				timeout = 5 * time.Minute
			}
			sessionTimeouts[acc.ID] = timeout
		}

		if rpm := acc.GetBaseRPM(); rpm > 0 {
			rpmMax += rpm
		}
	}

	// Batch query runtime data from Redis
	concurrencyMap, _ := s.concurrencyService.GetAccountConcurrencyBatch(ctx, accountIDs)

	var sessionsMap map[int64]int
	if sessionsMax > 0 && s.sessionLimitCache != nil {
		sessionsMap, _ = s.sessionLimitCache.GetActiveSessionCountBatch(ctx, accountIDs, sessionTimeouts)
	}

	var rpmMap map[int64]int
	if rpmMax > 0 && s.rpmCache != nil {
		rpmMap, _ = s.rpmCache.GetRPMBatch(ctx, accountIDs)
	}

	// Aggregate
	var concurrencyUsed, sessionsUsed, rpmUsed int
	for _, id := range accountIDs {
		concurrencyUsed += concurrencyMap[id]
		if sessionsMap != nil {
			sessionsUsed += sessionsMap[id]
		}
		if rpmMap != nil {
			rpmUsed += rpmMap[id]
		}
	}

	return GroupCapacitySummary{
		ConcurrencyUsed: concurrencyUsed,
		ConcurrencyMax:  concurrencyMax,
		SessionsUsed:    sessionsUsed,
		SessionsMax:     sessionsMax,
		RPMUsed:         rpmUsed,
		RPMMax:          rpmMax,
	}, nil
}

package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type groupCapacityAccountRepoStub struct {
	AccountRepository
	rows      []GroupAccountCapacityRow
	requested []int64
}

func (s *groupCapacityAccountRepoStub) ListSchedulableCapacityByGroupIDs(_ context.Context, groupIDs []int64) ([]GroupAccountCapacityRow, error) {
	s.requested = append([]int64(nil), groupIDs...)
	return append([]GroupAccountCapacityRow(nil), s.rows...), nil
}

type groupCapacityGroupRepoStub struct {
	GroupRepository
	groupIDs  []int64
	listCalls int
}

func (s *groupCapacityGroupRepoStub) ListActiveIDs(context.Context) ([]int64, error) {
	s.listCalls++
	return append([]int64(nil), s.groupIDs...), nil
}

type groupCapacityConcurrencyCacheStub struct {
	ConcurrencyCache
	counts    map[int64]int
	requested []int64
}

func (s *groupCapacityConcurrencyCacheStub) GetAccountConcurrencyBatch(_ context.Context, accountIDs []int64) (map[int64]int, error) {
	s.requested = append([]int64(nil), accountIDs...)
	out := make(map[int64]int, len(accountIDs))
	for _, id := range accountIDs {
		out[id] = s.counts[id]
	}
	return out, nil
}

type groupCapacitySessionCacheStub struct {
	SessionLimitCache
	counts       map[int64]int
	requested    []int64
	idleTimeouts map[int64]time.Duration
}

func (s *groupCapacitySessionCacheStub) GetActiveSessionCountBatch(_ context.Context, accountIDs []int64, idleTimeouts map[int64]time.Duration) (map[int64]int, error) {
	s.requested = append([]int64(nil), accountIDs...)
	s.idleTimeouts = make(map[int64]time.Duration, len(idleTimeouts))
	for id, timeout := range idleTimeouts {
		s.idleTimeouts[id] = timeout
	}
	out := make(map[int64]int, len(accountIDs))
	for _, id := range accountIDs {
		out[id] = s.counts[id]
	}
	return out, nil
}

type groupCapacityRPMCacheStub struct {
	RPMCache
	counts    map[int64]int
	requested []int64
}

func (s *groupCapacityRPMCacheStub) GetRPMBatch(_ context.Context, accountIDs []int64) (map[int64]int, error) {
	s.requested = append([]int64(nil), accountIDs...)
	out := make(map[int64]int, len(accountIDs))
	for _, id := range accountIDs {
		out[id] = s.counts[id]
	}
	return out, nil
}

func TestGetAllGroupCapacityBatchAggregatesRuntimeAndLimits(t *testing.T) {
	accountRepo := &groupCapacityAccountRepoStub{
		rows: []GroupAccountCapacityRow{
			{
				GroupID:     10,
				AccountID:   1,
				Concurrency: 2,
				Extra: map[string]any{
					"max_sessions":                 3,
					"session_idle_timeout_minutes": 7,
					"base_rpm":                     11,
				},
			},
			{
				GroupID:     20,
				AccountID:   1,
				Concurrency: 2,
				Extra: map[string]any{
					"max_sessions":                 3,
					"session_idle_timeout_minutes": 7,
					"base_rpm":                     11,
				},
			},
			{
				GroupID:     20,
				AccountID:   2,
				Concurrency: 4,
				Extra: map[string]any{
					"max_sessions":                 1,
					"session_idle_timeout_minutes": 9,
					"base_rpm":                     13,
				},
			},
		},
	}
	groupRepo := &groupCapacityGroupRepoStub{groupIDs: []int64{10, 20}}
	concurrencyCache := &groupCapacityConcurrencyCacheStub{counts: map[int64]int{1: 1, 2: 2}}
	sessionCache := &groupCapacitySessionCacheStub{counts: map[int64]int{1: 2, 2: 1}}
	rpmCache := &groupCapacityRPMCacheStub{counts: map[int64]int{1: 5, 2: 7}}
	svc := NewGroupCapacityService(
		accountRepo,
		groupRepo,
		NewConcurrencyService(concurrencyCache),
		sessionCache,
		rpmCache,
	)

	results, err := svc.GetAllGroupCapacity(context.Background())
	require.NoError(t, err)

	require.Equal(t, 1, groupRepo.listCalls)
	require.Equal(t, []int64{10, 20}, accountRepo.requested)
	require.Equal(t, []int64{1, 2}, concurrencyCache.requested)
	require.ElementsMatch(t, []int64{1, 2}, sessionCache.requested)
	require.ElementsMatch(t, []int64{1, 2}, rpmCache.requested)
	require.Equal(t, 7*time.Minute, sessionCache.idleTimeouts[1])
	require.Equal(t, 9*time.Minute, sessionCache.idleTimeouts[2])

	require.Equal(t, []GroupCapacitySummary{
		{
			GroupID:         10,
			ConcurrencyUsed: 1,
			ConcurrencyMax:  2,
			SessionsUsed:    2,
			SessionsMax:     3,
			RPMUsed:         5,
			RPMMax:          11,
		},
		{
			GroupID:         20,
			ConcurrencyUsed: 3,
			ConcurrencyMax:  6,
			SessionsUsed:    3,
			SessionsMax:     4,
			RPMUsed:         12,
			RPMMax:          24,
		},
	}, results)
}

func TestGetAllGroupCapacityBatchKeepsEmptyGroupRows(t *testing.T) {
	accountRepo := &groupCapacityAccountRepoStub{
		rows: []GroupAccountCapacityRow{
			{GroupID: 20, AccountID: 2, Concurrency: 4},
		},
	}
	groupRepo := &groupCapacityGroupRepoStub{groupIDs: []int64{10, 20}}
	svc := NewGroupCapacityService(accountRepo, groupRepo, nil, nil, nil)

	results, err := svc.GetAllGroupCapacity(context.Background())
	require.NoError(t, err)

	require.Equal(t, []GroupCapacitySummary{
		{GroupID: 10},
		{GroupID: 20, ConcurrencyMax: 4},
	}, results)
}

func TestAggregateCodexQuotaWindow_EqualWeightAverage(t *testing.T) {
	now := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	resetAt := now.Add(2 * time.Hour).Format(time.RFC3339)

	accounts := []Account{
		{Extra: map[string]any{
			"codex_5h_used_percent": 20.0,
			"codex_5h_reset_at":     resetAt,
		}},
		{Extra: map[string]any{
			"codex_5h_used_percent": 30.0,
			"codex_5h_reset_at":     resetAt,
		}},
	}

	got := aggregateCodexQuotaWindow(accounts, "5h", now)
	if got.UsedPercent != 25 {
		t.Fatalf("UsedPercent = %v, want 25", got.UsedPercent)
	}
	if got.RemainingPercent != 75 {
		t.Fatalf("RemainingPercent = %v, want 75", got.RemainingPercent)
	}
	if got.SampledAccounts != 2 || got.MissingAccounts != 0 || got.ExpiredAccounts != 0 {
		t.Fatalf("account counts = sampled %d missing %d expired %d, want 2/0/0",
			got.SampledAccounts, got.MissingAccounts, got.ExpiredAccounts)
	}
}

func TestAggregateCodexQuotaWindow_ExcludesMissingAndExpired(t *testing.T) {
	now := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)

	accounts := []Account{
		{Extra: map[string]any{
			"codex_7d_used_percent": 40.0,
			"codex_7d_reset_at":     now.Add(24 * time.Hour).Format(time.RFC3339),
		}},
		{Extra: nil},
		{Extra: map[string]any{
			"codex_7d_used_percent": 80.0,
			"codex_7d_reset_at":     now.Add(-time.Hour).Format(time.RFC3339),
		}},
	}

	got := aggregateCodexQuotaWindow(accounts, "7d", now)
	if got.UsedPercent != 40 {
		t.Fatalf("UsedPercent = %v, want 40", got.UsedPercent)
	}
	if got.RemainingPercent != 60 {
		t.Fatalf("RemainingPercent = %v, want 60", got.RemainingPercent)
	}
	if got.SampledAccounts != 1 || got.MissingAccounts != 1 || got.ExpiredAccounts != 1 {
		t.Fatalf("account counts = sampled %d missing %d expired %d, want 1/1/1",
			got.SampledAccounts, got.MissingAccounts, got.ExpiredAccounts)
	}
}

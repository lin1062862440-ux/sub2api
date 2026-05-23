package service

import (
	"testing"
	"time"
)

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

package repository

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func TestUserGroupQuotaIncrementUpdatesPoolAndMemberInOneTransaction(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	weekStart := time.Date(2026, time.August, 2, 16, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT member.user_group_id")).
		WithArgs(int64(5), int64(7), int64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"user_group_id"}).AddRow(5))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT user_id")).
		WithArgs(int64(5), int64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(7))
	mock.ExpectExec("UPDATE user_group_quota_policies").
		WithArgs(int64(5), 2.5, weekStart).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE user_group_quota_members").
		WithArgs(int64(5), 2.5, weekStart, int64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	repo := &userGroupQuotaRepository{db: db}
	require.NoError(t, repo.IncrementUsage(context.Background(), 5, 11, 7, 2.5, weekStart))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupQuotaIncrementIgnoresUsersWithoutAssignment(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT member.user_group_id")).
		WithArgs(int64(5), int64(7), int64(11)).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectCommit()

	repo := &userGroupQuotaRepository{db: db}
	require.NoError(t, repo.IncrementUsage(context.Background(), 5, 11, 7, 2.5, time.Now()))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupQuotaResetClearsUsageAndPreservesAllocations(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	resetAt := time.Date(2026, time.August, 6, 4, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT enabled FROM user_group_quota_policies").
		WithArgs(int64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"enabled"}).AddRow(true))
	mock.ExpectExec("UPDATE user_group_quota_policies").
		WithArgs(int64(5), resetAt, int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE user_group_quota_members").
		WithArgs(int64(5), resetAt, int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	repo := &userGroupQuotaRepository{db: db}
	require.NoError(t, repo.ResetUsage(context.Background(), 5, 1, resetAt))
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupQuotaOverviewIncludesWeeklyCumulativeUsage(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	weekStart := time.Date(2026, time.August, 2, 16, 0, 0, 0, time.UTC)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT COALESCE(policy.enabled")).
		WithArgs(int64(5), weekStart).
		WillReturnRows(sqlmock.NewRows([]string{"enabled", "weekly_limit_usd", "weekly_usage_usd", "weekly_window_start"}).
			AddRow(true, 800, 250, weekStart))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COALESCE(SUM(actual_cost), 0)")).
		WithArgs(int64(5), weekStart).
		WillReturnRows(sqlmock.NewRows([]string{"weekly_cumulative_usage_usd"}).AddRow(390))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT u.id, u.email, u.username, COALESCE(avatar.url, ''), u.status, manager.created_at")).
		WithArgs(int64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "username", "avatar_url", "status", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta("COALESCE(usage.weekly_cumulative_usage_usd, 0)")).
		WithArgs(int64(5), weekStart).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "username", "avatar_url", "status", "weekly_limit_usd", "weekly_usage_usd", "weekly_cumulative_usage_usd", "weekly_window_start"}).
			AddRow(7, "alice@example.com", "Alice", "", "active", 300, 120, 180, weekStart))

	repo := &userGroupQuotaRepository{db: db}
	overview, err := repo.GetOverview(context.Background(), 5, weekStart)
	require.NoError(t, err)
	require.Equal(t, 390.0, overview.Policy.WeeklyCumulativeUsageUSD)
	require.Len(t, overview.Members, 1)
	require.Equal(t, 180.0, overview.Members[0].WeeklyCumulativeUsageUSD)
	require.NoError(t, mock.ExpectationsWereMet())
}

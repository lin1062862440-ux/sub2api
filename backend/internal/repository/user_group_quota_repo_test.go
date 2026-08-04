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

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestUserGroupPromptCaptureRepositoryLoadsEligibility(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	mock.ExpectQuery(`(?s)FROM user_group_members ugm.*prompt_capture_enabled = TRUE`).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "user_group_id"}).AddRow(7, 2).AddRow(7, 5).AddRow(9, 5))

	repo := NewUserGroupPromptCaptureRepository(db)
	got, err := repo.LoadEligibility(context.Background())
	require.NoError(t, err)
	require.Equal(t, map[int64][]int64{7: {2, 5}, 9: {5}}, got)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupPromptCaptureRepositoryInsertsCaptureAndAssociationsAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	now := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery(`(?s)INSERT INTO user_prompt_captures.*ON CONFLICT \(event_id\).*RETURNING id`).
		WithArgs("event-1", "req-1", int64(7), "anthropic_messages", "claude", "http", "safe text", "hash", 9, false, now, now.Add(service.UserGroupPromptRetention)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(41))
	mock.ExpectExec(`(?s)INSERT INTO user_group_prompt_captures.*SELECT \$1, ul.business_user_group_id.*ul.business_user_group_id = ANY`).
		WithArgs(int64(41), sqlmock.AnyArg(), int64(7), "req-1").WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`UPDATE user_prompt_captures SET expires_at=captured_at \+ INTERVAL '14 days'`).
		WithArgs(int64(41)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	repo := NewUserGroupPromptCaptureRepository(db)
	err = repo.InsertCapture(context.Background(), service.UserPromptCaptureWrite{
		EventID: "event-1", RequestID: "req-1", UserID: 7, Protocol: "anthropic_messages", Model: "claude", Stage: "http",
		RedactedPrompt: "safe text", PromptHash: "hash", PromptLength: 9, GroupIDs: []int64{5, 2, 5}, CapturedAt: now, ExpiresAt: now.Add(service.UserGroupPromptRetention),
	})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupPromptCaptureRepositoryListsOnlyLiveScopedUsagePrompts(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	now := time.Now().UTC()
	mock.ExpectQuery(`(?s)JOIN usage_logs ul ON ul.user_id = upc.user_id AND ul.request_id = upc.request_id.*JOIN user_group_prompt_captures ugpc.*ugpc.user_group_id = \$1.*ul.id = \$2.*upc.expires_at > NOW\(\)`).
		WithArgs(int64(2), int64(31)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "request_id", "protocol", "model", "stage", "redacted_prompt", "prompt_length", "truncated", "captured_at", "expires_at"}).
			AddRow(41, "req-1", "anthropic_messages", "claude", "http", "safe", 4, false, now, now.Add(time.Hour)))

	repo := NewUserGroupPromptCaptureRepository(db)
	items, err := repo.ListUsagePrompts(context.Background(), 2, 31)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, "safe", items[0].RedactedPrompt)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupPromptCaptureRepositoryDeletesExpiredBatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	now := time.Now().UTC()
	mock.ExpectExec(`(?s)WITH expired AS .*FOR UPDATE SKIP LOCKED.*DELETE FROM user_prompt_captures`).
		WithArgs(now, 1000).WillReturnResult(sqlmock.NewResult(0, 12))

	repo := NewUserGroupPromptCaptureRepository(db)
	deleted, err := repo.DeleteExpiredBatch(context.Background(), now, 1000)
	require.NoError(t, err)
	require.Equal(t, int64(12), deleted)
	require.NoError(t, mock.ExpectationsWereMet())
}

package repository

import (
	"context"
	"database/sql/driver"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestUserGroupRepositoryListAccessibleScopesDelegatedUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	now := time.Now().UTC()
	mock.ExpectQuery(`(?s)LEFT JOIN user_group_members ugm.*LEFT JOIN users member_users.*member_users\.deleted_at IS NULL.*LEFT JOIN user_group_viewer_grants viewers.*LEFT JOIN users viewer_users.*viewer_users\.deleted_at IS NULL`).
		WithArgs(int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "description", "status", "created_by", "created_at", "updated_at", "member_count", "viewer_count"}).
			AddRow(3, "Team A", "", "active", int64(1), now, now, 4, 2))

	repo := NewUserGroupRepository(db)
	groups, err := repo.ListAccessible(context.Background(), 12, false)
	require.NoError(t, err)
	require.Len(t, groups, 1)
	require.Equal(t, int64(3), groups[0].ID)
	require.Equal(t, int64(4), groups[0].MemberCount)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupRepositoryGetByIDExcludesDeletedPeopleFromCounts(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	now := time.Now().UTC()
	mock.ExpectQuery(`(?s)LEFT JOIN user_group_members ugm.*LEFT JOIN users member_users.*member_users\.deleted_at IS NULL.*LEFT JOIN user_group_viewer_grants ugvg.*LEFT JOIN users viewer_users.*viewer_users\.deleted_at IS NULL`).
		WithArgs(int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "description", "status", "created_by", "created_at", "updated_at", "member_count", "viewer_count"}).
			AddRow(3, "Team A", "", "active", int64(1), now, now, 4, 2))

	repo := NewUserGroupRepository(db)
	group, err := repo.GetByID(context.Background(), 3)
	require.NoError(t, err)
	require.Equal(t, int64(4), group.MemberCount)
	require.Equal(t, int64(2), group.ViewerCount)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupRepositoryReplaceMembersIsAtomic(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM user_groups WHERE id = $1 AND status = 'active' FOR UPDATE")).
		WithArgs(int64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(5))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM users WHERE id = ANY($1) AND deleted_at IS NULL") + `\s*$`).
		WithArgs(sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM user_group_members WHERE user_group_id = $1")).
		WithArgs(int64(5)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO user_group_members").
		WithArgs(int64(5), sqlmock.AnyArg(), int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectCommit()

	repo := NewUserGroupRepository(db)
	err = repo.ReplaceMembers(context.Background(), 5, []int64{7, 9}, 1)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupRepositorySubscriptionsKeepMembersWithoutSubscription(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	mock.ExpectQuery("COUNT\\(DISTINCT ugm.user_id\\)").
		WithArgs(int64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"member_count", "active_subscription_count", "no_subscription_count", "total_balance", "active_subscription_usage"}).
			AddRow(2, 1, 1, 42.5, 3.25))
	mock.ExpectQuery("COUNT\\(\\*\\).*FROM user_group_members ugm").
		WithArgs(int64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery("LEFT JOIN user_subscriptions us").
		WithArgs(int64(5), 20, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"user_id", "email", "username", "avatar_url", "user_status", "balance", "joined_at",
			"subscription_id", "billing_group_id", "billing_group", "platform", "subscription_status", "starts_at", "expires_at",
			"daily_used", "daily_limit", "weekly_used", "weekly_limit", "monthly_used", "monthly_limit",
		}).
			AddRow(7, "with@example.com", "With", "", "active", 12.5, time.Now(), 21, 4, "Plan", "openai", "active", time.Now(), time.Now().Add(time.Hour), 1.0, 2.0, 2.0, 4.0, 3.0, 6.0).
			AddRow(9, "none@example.com", "None", "", "active", 30.0, time.Now(), nil, nil, "", "", "", nil, nil, 0.0, nil, 0.0, nil, 0.0, nil))

	repo := NewUserGroupRepository(db)
	result, err := repo.ListSubscriptions(context.Background(), 5, service.UserGroupSubscriptionQuery{Page: 1, PageSize: 20})
	require.NoError(t, err)
	require.Len(t, result.Items, 2)
	require.NotNil(t, result.Items[0].SubscriptionID)
	require.Nil(t, result.Items[1].SubscriptionID)
	require.Equal(t, int64(1), result.Summary.NoSubscriptionCount)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestUserGroupSubscriptionStatusConditionUsesEffectiveStatus(t *testing.T) {
	active, activeArgs := userGroupSubscriptionStatusCondition(service.SubscriptionStatusActive, 2)
	require.Empty(t, activeArgs)
	require.Contains(t, active, "us.status = 'active'")
	require.Contains(t, active, "us.expires_at > NOW()")

	expired, expiredArgs := userGroupSubscriptionStatusCondition(service.SubscriptionStatusExpired, 2)
	require.Empty(t, expiredArgs)
	require.Contains(t, expired, "us.status = 'expired'")
	require.Contains(t, expired, "us.status = 'active' AND us.expires_at <= NOW()")
}

func TestUserGroupRepositoryUsageSplitsBillingModes(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	start := time.Now().Add(-24 * time.Hour).UTC()
	end := time.Now().UTC()
	baseArgs := []driver.Value{int64(5), start, end}
	mock.ExpectQuery("SUM\\(CASE WHEN ul.billing_type = 0 THEN ul.actual_cost ELSE 0 END\\)").
		WithArgs(baseArgs...).
		WillReturnRows(sqlmock.NewRows([]string{"total_requests", "input_tokens", "output_tokens", "cache_tokens", "total_tokens", "actual_cost", "balance_cost", "subscription_cost"}).
			AddRow(6, 100, 50, 10, 160, 8.5, 3.0, 5.5))
	mock.ExpectQuery("GROUP BY u.id, u.email, u.username").
		WithArgs(baseArgs...).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "email", "username", "total_requests", "total_tokens", "actual_cost", "balance_cost", "subscription_cost"}).
			AddRow(7, "member@example.com", "Member", 6, 160, 8.5, 3.0, 5.5))
	mock.ExpectQuery("COUNT\\(\\*\\)").
		WithArgs(baseArgs...).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery("SELECT ul.id").
		WithArgs(int64(5), start, end, 20, 0).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "email", "username", "request_id", "model", "input_tokens", "output_tokens", "cache_creation_tokens", "cache_read_tokens", "actual_cost", "billing_type", "created_at"}).
			AddRow(31, 7, "member@example.com", "Member", "req-1", "gpt-5", 100, 50, 5, 5, 8.5, 1, end))

	repo := NewUserGroupRepository(db)
	result, err := repo.GetUsage(context.Background(), 5, service.UserGroupUsageQuery{StartTime: start, EndTime: end, Page: 1, PageSize: 20})
	require.NoError(t, err)
	require.Equal(t, 3.0, result.Summary.BalanceConsumption)
	require.Equal(t, 5.5, result.Summary.SubscriptionConsumption)
	require.Equal(t, 160, result.Items[0].TotalTokens)
	require.NoError(t, mock.ExpectationsWereMet())
}

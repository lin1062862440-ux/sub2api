package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

type userGroupQuotaRepository struct {
	db *sql.DB
}

func NewUserGroupQuotaRepository(db *sql.DB) service.UserGroupQuotaRepository {
	return &userGroupQuotaRepository{db: db}
}

func (r *userGroupQuotaRepository) CountManaged(ctx context.Context, actorID int64) (int64, error) {
	var count int64
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM user_group_quota_managers manager
		JOIN user_groups ug ON ug.id = manager.user_group_id AND ug.status = 'active'
		WHERE manager.user_id = $1`, actorID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count managed user group quotas: %w", err)
	}
	return count, nil
}

func (r *userGroupQuotaRepository) CanManage(ctx context.Context, groupID, actorID int64) (bool, error) {
	var allowed bool
	err := r.db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM user_group_quota_managers manager
			JOIN user_groups ug ON ug.id = manager.user_group_id AND ug.status = 'active'
			WHERE manager.user_group_id = $1 AND manager.user_id = $2
		)`, groupID, actorID).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("check user group quota manager: %w", err)
	}
	return allowed, nil
}

func (r *userGroupQuotaRepository) GetOverview(ctx context.Context, groupID int64, weekStart time.Time) (*service.UserGroupQuotaOverview, error) {
	overview := &service.UserGroupQuotaOverview{GroupID: groupID}
	var storedWindow sql.NullTime
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(policy.enabled, FALSE),
		       COALESCE(policy.weekly_limit_usd, 0),
		       CASE
		           WHEN policy.weekly_window_start IS NULL OR policy.weekly_window_start < $2 THEN 0
		           ELSE policy.weekly_usage_usd
		       END,
		       policy.weekly_window_start
		FROM user_groups ug
		LEFT JOIN user_group_quota_policies policy ON policy.user_group_id = ug.id
		WHERE ug.id = $1 AND ug.status = 'active'`, groupID, weekStart).Scan(
		&overview.Policy.Enabled, &overview.Policy.WeeklyLimitUSD, &overview.Policy.WeeklyUsageUSD, &storedWindow,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, service.ErrUserGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user group quota policy: %w", err)
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(actual_cost), 0)
		FROM usage_logs
		WHERE business_user_group_id = $1
		  AND created_at >= $2
		  AND created_at < NOW()`, groupID, weekStart).Scan(&overview.Policy.WeeklyCumulativeUsageUSD); err != nil {
		return nil, fmt.Errorf("get user group weekly cumulative usage: %w", err)
	}
	if overview.Policy.Enabled {
		window := weekStart
		overview.Policy.WeeklyWindowStart = &window
	}

	managers, err := r.listManagers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	overview.Managers = managers

	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.email, u.username, COALESCE(avatar.url, ''), u.status,
		       COALESCE(quota.weekly_limit_usd, 0),
		       CASE
		           WHEN quota.weekly_window_start IS NULL OR quota.weekly_window_start < $2 THEN 0
		           ELSE quota.weekly_usage_usd
		       END,
		       COALESCE(usage.weekly_cumulative_usage_usd, 0),
		       quota.weekly_window_start
		FROM user_group_members member
		JOIN users u ON u.id = member.user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars avatar ON avatar.user_id = u.id
		LEFT JOIN user_group_quota_members quota
		       ON quota.user_group_id = member.user_group_id AND quota.user_id = member.user_id
		LEFT JOIN (
		       SELECT user_id, SUM(actual_cost) AS weekly_cumulative_usage_usd
		       FROM usage_logs
		       WHERE business_user_group_id = $1
		         AND created_at >= $2
		         AND created_at < NOW()
		       GROUP BY user_id
		) usage ON usage.user_id = member.user_id
		WHERE member.user_group_id = $1
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id`, groupID, weekStart)
	if err != nil {
		return nil, fmt.Errorf("list user group quota members: %w", err)
	}
	defer rows.Close()
	overview.Members = make([]service.UserGroupQuotaMember, 0)
	for rows.Next() {
		var member service.UserGroupQuotaMember
		var memberWindow sql.NullTime
		if err := rows.Scan(
			&member.UserID, &member.Email, &member.Username, &member.AvatarURL, &member.Status,
			&member.WeeklyLimitUSD, &member.WeeklyUsageUSD, &member.WeeklyCumulativeUsageUSD, &memberWindow,
		); err != nil {
			return nil, fmt.Errorf("scan user group quota member: %w", err)
		}
		if overview.Policy.Enabled {
			window := weekStart
			member.WeeklyWindowStart = &window
		}
		overview.AllocatedUSD += member.WeeklyLimitUSD
		overview.Members = append(overview.Members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list user group quota members rows: %w", err)
	}
	return overview, nil
}

func (r *userGroupQuotaRepository) listManagers(ctx context.Context, groupID int64) ([]service.UserGroupViewer, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.email, u.username, COALESCE(avatar.url, ''), u.status, manager.created_at
		FROM user_group_quota_managers manager
		JOIN users u ON u.id = manager.user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars avatar ON avatar.user_id = u.id
		WHERE manager.user_group_id = $1
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list user group quota managers: %w", err)
	}
	defer rows.Close()
	managers := make([]service.UserGroupViewer, 0)
	for rows.Next() {
		var manager service.UserGroupViewer
		if err := rows.Scan(&manager.UserID, &manager.Email, &manager.Username, &manager.AvatarURL, &manager.Status, &manager.GrantedAt); err != nil {
			return nil, fmt.Errorf("scan user group quota manager: %w", err)
		}
		managers = append(managers, manager)
	}
	return managers, rows.Err()
}

func (r *userGroupQuotaRepository) SetPolicy(ctx context.Context, groupID int64, mutation service.UserGroupQuotaPolicyMutation, actorID int64, weekStart time.Time) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var lockedGroupID int64
	if err = tx.QueryRowContext(ctx, `SELECT id FROM user_groups WHERE id = $1 AND status = 'active' FOR UPDATE`, groupID).Scan(&lockedGroupID); errors.Is(err, sql.ErrNoRows) {
		return service.ErrUserGroupNotFound
	} else if err != nil {
		return fmt.Errorf("lock user group for quota policy: %w", err)
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO user_group_quota_policies (
			user_group_id, enabled, weekly_limit_usd, weekly_usage_usd, weekly_window_start, updated_by
		) VALUES ($1, $2, $3, 0, $4, $5)
		ON CONFLICT (user_group_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			weekly_limit_usd = EXCLUDED.weekly_limit_usd,
			weekly_usage_usd = CASE
				WHEN user_group_quota_policies.weekly_window_start IS NULL
				  OR user_group_quota_policies.weekly_window_start < EXCLUDED.weekly_window_start THEN 0
				ELSE user_group_quota_policies.weekly_usage_usd
			END,
			weekly_window_start = CASE
				WHEN user_group_quota_policies.weekly_window_start IS NULL
				  OR user_group_quota_policies.weekly_window_start < EXCLUDED.weekly_window_start
				THEN EXCLUDED.weekly_window_start
				ELSE user_group_quota_policies.weekly_window_start
			END,
			updated_by = EXCLUDED.updated_by,
			updated_at = NOW()`, groupID, mutation.Enabled, mutation.WeeklyLimitUSD, weekStart, actorID); err != nil {
		return fmt.Errorf("set user group quota policy: %w", err)
	}

	if !mutation.Enabled {
		if err = disableTeamSubscriptionsForUserGroupTx(ctx, tx, groupID, nil); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM user_group_quota_members WHERE user_group_id = $1`, groupID); err != nil {
			return fmt.Errorf("clear disabled user group quota members: %w", err)
		}
		return tx.Commit()
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO user_group_quota_members (
			user_id, user_group_id, weekly_limit_usd, weekly_usage_usd, weekly_window_start, updated_by
		)
		SELECT member.user_id, member.user_group_id, 0, 0, $2, $3
		FROM user_group_members member
		WHERE member.user_group_id = $1
		ON CONFLICT (user_id) DO NOTHING`, groupID, weekStart, actorID); err != nil {
		return fmt.Errorf("initialize user group quota members: %w", err)
	}

	var memberCount, quotaMemberCount int64
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_group_members WHERE user_group_id = $1`, groupID).Scan(&memberCount); err != nil {
		return err
	}
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_group_quota_members WHERE user_group_id = $1`, groupID).Scan(&quotaMemberCount); err != nil {
		return err
	}
	if memberCount != quotaMemberCount {
		return service.ErrUserGroupQuotaMembershipConflict
	}

	var allocated float64
	if err = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(weekly_limit_usd), 0) FROM user_group_quota_members WHERE user_group_id = $1`, groupID).Scan(&allocated); err != nil {
		return err
	}
	if allocated > mutation.WeeklyLimitUSD+0.00000001 {
		return service.ErrUserGroupQuotaAllocationExceeded
	}
	return tx.Commit()
}

func (r *userGroupQuotaRepository) ReplaceManagers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if len(userIDs) > 0 {
		var count int
		if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE id = ANY($1) AND deleted_at IS NULL`, pq.Array(userIDs)).Scan(&count); err != nil {
			return fmt.Errorf("validate user group quota managers: %w", err)
		}
		if count != len(userIDs) {
			return service.ErrUserGroupInvalidUserIDs
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM user_group_quota_managers WHERE user_group_id = $1`, groupID); err != nil {
		return err
	}
	if len(userIDs) > 0 {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO user_group_quota_managers (user_group_id, user_id, created_by)
			SELECT $1, user_id, $3 FROM unnest($2::bigint[]) AS user_id`, groupID, pq.Array(userIDs), actorID); err != nil {
			return fmt.Errorf("insert user group quota managers: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO user_group_viewer_grants (user_group_id, viewer_user_id, created_by)
			SELECT $1, user_id, $3 FROM unnest($2::bigint[]) AS user_id
			ON CONFLICT (user_group_id, viewer_user_id) DO NOTHING`, groupID, pq.Array(userIDs), actorID); err != nil {
			return fmt.Errorf("grant quota manager group access: %w", err)
		}
	}
	return tx.Commit()
}

func (r *userGroupQuotaRepository) UpdateMemberQuotas(ctx context.Context, groupID int64, mutations []service.UserGroupMemberQuotaMutation, actorID int64, weekStart time.Time) (err error) {
	if len(mutations) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var enabled bool
	var groupLimit float64
	err = tx.QueryRowContext(ctx, `
		SELECT enabled, weekly_limit_usd
		FROM user_group_quota_policies
		WHERE user_group_id = $1
		FOR UPDATE`, groupID).Scan(&enabled, &groupLimit)
	if errors.Is(err, sql.ErrNoRows) || !enabled {
		return service.ErrUserGroupQuotaDisabled
	}
	if err != nil {
		return err
	}

	userIDs := make([]int64, 0, len(mutations))
	updatedTotal := 0.0
	for _, mutation := range mutations {
		userIDs = append(userIDs, mutation.UserID)
		updatedTotal += mutation.WeeklyLimitUSD
	}
	var matched int
	if err = tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM user_group_quota_members
		WHERE user_group_id = $1 AND user_id = ANY($2)`, groupID, pq.Array(userIDs)).Scan(&matched); err != nil {
		return err
	}
	if matched != len(userIDs) {
		return service.ErrUserGroupQuotaMemberNotFound
	}
	var unchangedTotal float64
	if err = tx.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(weekly_limit_usd), 0)
		FROM user_group_quota_members
		WHERE user_group_id = $1 AND NOT (user_id = ANY($2))`, groupID, pq.Array(userIDs)).Scan(&unchangedTotal); err != nil {
		return err
	}
	if unchangedTotal+updatedTotal > groupLimit+0.00000001 {
		return service.ErrUserGroupQuotaAllocationExceeded
	}
	for _, mutation := range mutations {
		if _, err = tx.ExecContext(ctx, `
			UPDATE user_group_quota_members
			SET weekly_limit_usd = $3,
			    weekly_usage_usd = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $4 THEN 0 ELSE weekly_usage_usd END,
			    weekly_window_start = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $4 THEN $4 ELSE weekly_window_start END,
			    updated_by = $5,
			    updated_at = NOW()
			WHERE user_group_id = $1 AND user_id = $2`, groupID, mutation.UserID, mutation.WeeklyLimitUSD, weekStart, actorID); err != nil {
			return fmt.Errorf("update user group member quota: %w", err)
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE api_keys SET group_id=NULL, updated_at=NOW()
		WHERE deleted_at IS NULL AND user_id IN (
			SELECT user_id FROM user_group_quota_members WHERE user_group_id=$1 AND weekly_limit_usd <= 0
		) AND group_id IN (
			SELECT billing_group_id FROM user_group_team_subscription_groups WHERE user_group_id=$1
		)`, groupID); err != nil {
		return fmt.Errorf("detach zero-quota team api keys: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE user_subscriptions SET status='suspended', deleted_at=NOW(), updated_at=NOW()
		WHERE owner_user_group_id=$1 AND deleted_at IS NULL AND user_id IN (
			SELECT user_id FROM user_group_quota_members WHERE user_group_id=$1 AND weekly_limit_usd <= 0
		)`, groupID); err != nil {
		return fmt.Errorf("disable zero-quota team subscriptions: %w", err)
	}
	if err = syncTeamSubscriptionsForUserGroupTx(ctx, tx, groupID, actorID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *userGroupQuotaRepository) ResetUsage(ctx context.Context, groupID, actorID int64, resetAt time.Time) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var enabled bool
	if err = tx.QueryRowContext(ctx, `SELECT enabled FROM user_group_quota_policies WHERE user_group_id=$1 FOR UPDATE`, groupID).Scan(&enabled); errors.Is(err, sql.ErrNoRows) || !enabled {
		return service.ErrUserGroupQuotaDisabled
	} else if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE user_group_quota_policies
		SET weekly_usage_usd=0, weekly_window_start=$2, updated_by=$3, updated_at=NOW()
		WHERE user_group_id=$1`, groupID, resetAt, actorID); err != nil {
		return fmt.Errorf("reset user group quota pool: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE user_group_quota_members
		SET weekly_usage_usd=0, weekly_window_start=$2, updated_by=$3, updated_at=NOW()
		WHERE user_group_id=$1`, groupID, resetAt, actorID); err != nil {
		return fmt.Errorf("reset user group member quotas: %w", err)
	}
	return tx.Commit()
}

func (r *userGroupQuotaRepository) GetUserQuotaState(ctx context.Context, groupID, billingGroupID, userID int64, weekStart time.Time) (*service.UserGroupQuotaState, error) {
	var state service.UserGroupQuotaState
	err := r.db.QueryRowContext(ctx, `
		SELECT policy.user_group_id,
		       policy.weekly_limit_usd,
			       CASE WHEN policy.weekly_window_start IS NULL OR policy.weekly_window_start < $3 THEN 0 ELSE policy.weekly_usage_usd END,
			       member.weekly_limit_usd,
			       CASE WHEN member.weekly_window_start IS NULL OR member.weekly_window_start < $3 THEN 0 ELSE member.weekly_usage_usd END
		FROM user_group_quota_members member
			JOIN user_group_quota_policies policy ON policy.user_group_id = member.user_group_id AND policy.enabled = TRUE
			JOIN user_groups ug ON ug.id = policy.user_group_id AND ug.status = 'active'
			JOIN user_group_team_subscription_groups mapping ON mapping.user_group_id=member.user_group_id AND mapping.billing_group_id=$4
			WHERE member.user_group_id = $1 AND member.user_id = $2`, groupID, userID, weekStart, billingGroupID).Scan(
		&state.GroupID, &state.GroupWeeklyLimit, &state.GroupWeeklyUsage,
		&state.MemberWeeklyLimit, &state.MemberWeeklyUsage,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user group quota state: %w", err)
	}
	return &state, nil
}

func (r *userGroupQuotaRepository) IncrementUsage(ctx context.Context, groupID, billingGroupID, userID int64, amount float64, weekStart time.Time) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err = incrementUserGroupQuotaUsageTx(ctx, tx, groupID, billingGroupID, userID, amount, weekStart); err != nil {
		return err
	}
	return tx.Commit()
}

func incrementUserGroupQuotaUsageTx(ctx context.Context, tx *sql.Tx, groupID, billingGroupID, userID int64, amount float64, weekStart time.Time) error {
	var lockedGroupID int64
	err := tx.QueryRowContext(ctx, `
		SELECT member.user_group_id
		FROM user_group_quota_members member
			JOIN user_group_quota_policies policy ON policy.user_group_id = member.user_group_id AND policy.enabled = TRUE
			JOIN user_groups ug ON ug.id = policy.user_group_id AND ug.status = 'active'
			JOIN user_group_team_subscription_groups mapping ON mapping.user_group_id=member.user_group_id AND mapping.billing_group_id=$3
			WHERE member.user_group_id = $1 AND member.user_id = $2
			FOR UPDATE OF policy`, groupID, userID, billingGroupID).Scan(&lockedGroupID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var lockedUserID int64
	err = tx.QueryRowContext(ctx, `
		SELECT user_id
		FROM user_group_quota_members
		WHERE user_group_id = $1 AND user_id = $2
		FOR UPDATE`, groupID, userID).Scan(&lockedUserID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE user_group_quota_policies
		SET weekly_usage_usd = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $3 THEN $2 ELSE weekly_usage_usd + $2 END,
		    weekly_window_start = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $3 THEN $3 ELSE weekly_window_start END,
		    updated_at = NOW()
		WHERE user_group_id = $1 AND enabled = TRUE`, groupID, amount, weekStart); err != nil {
		return fmt.Errorf("increment user group quota pool usage: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE user_group_quota_members
		SET weekly_usage_usd = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $3 THEN $2 ELSE weekly_usage_usd + $2 END,
		    weekly_window_start = CASE WHEN weekly_window_start IS NULL OR weekly_window_start < $3 THEN $3 ELSE weekly_window_start END,
		    updated_at = NOW()
		WHERE user_group_id = $1 AND user_id = $4`, groupID, amount, weekStart, userID); err != nil {
		return fmt.Errorf("increment user group member quota usage: %w", err)
	}
	return nil
}

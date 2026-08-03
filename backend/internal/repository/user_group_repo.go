package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

type userGroupRepository struct {
	db *sql.DB
}

func NewUserGroupRepository(db *sql.DB) service.UserGroupRepository {
	return &userGroupRepository{db: db}
}

func (r *userGroupRepository) CountAccessible(ctx context.Context, actorID int64, isAdmin bool) (int64, error) {
	query := "SELECT COUNT(*) FROM user_groups WHERE status = 'active'"
	args := []any(nil)
	if !isAdmin {
		query = `
			SELECT COUNT(*)
			FROM user_groups ug
			JOIN user_group_viewer_grants ugvg ON ugvg.user_group_id = ug.id
			WHERE ug.status = 'active' AND ugvg.viewer_user_id = $1`
		args = []any{actorID}
	}
	var count int64
	if err := r.db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0, fmt.Errorf("count accessible user groups: %w", err)
	}
	return count, nil
}

func (r *userGroupRepository) ListAccessible(ctx context.Context, actorID int64, isAdmin bool) ([]service.UserGroup, error) {
	join := ""
	args := []any{actorID}
	if !isAdmin {
		join = "JOIN user_group_viewer_grants ugvg ON ugvg.user_group_id = ug.id AND ugvg.viewer_user_id = $1"
	}
	query := fmt.Sprintf(`
		SELECT ug.id, ug.name, ug.description, ug.status, ug.created_by,
		       ug.created_at, ug.updated_at,
		       COUNT(DISTINCT member_users.id) AS member_count,
		       COUNT(DISTINCT viewer_users.id) AS viewer_count,
		       ug.prompt_capture_enabled,
		       EXISTS (
		           SELECT 1 FROM user_group_prompt_viewer_grants ugpvg
		           WHERE ugpvg.user_group_id = ug.id AND ugpvg.viewer_user_id = $1
		       ) AS can_view_prompt
		FROM user_groups ug
		%s
		LEFT JOIN user_group_members ugm ON ugm.user_group_id = ug.id
		LEFT JOIN users member_users ON member_users.id = ugm.user_id AND member_users.deleted_at IS NULL
		LEFT JOIN user_group_viewer_grants viewers ON viewers.user_group_id = ug.id
		LEFT JOIN users viewer_users ON viewer_users.id = viewers.viewer_user_id AND viewer_users.deleted_at IS NULL
		WHERE ug.status = 'active'
		GROUP BY ug.id
		ORDER BY ug.updated_at DESC, ug.id DESC`, join)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list accessible user groups: %w", err)
	}
	defer rows.Close()
	groups := make([]service.UserGroup, 0)
	for rows.Next() {
		group, err := scanUserGroup(rows)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list accessible user groups rows: %w", err)
	}
	return groups, nil
}

func (r *userGroupRepository) CanView(ctx context.Context, groupID, actorID int64) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM user_groups ug
			JOIN user_group_viewer_grants ugvg ON ugvg.user_group_id = ug.id
			WHERE ug.id = $1 AND ug.status = 'active' AND ugvg.viewer_user_id = $2
		)`
	var allowed bool
	if err := r.db.QueryRowContext(ctx, query, groupID, actorID).Scan(&allowed); err != nil {
		return false, fmt.Errorf("check user group access: %w", err)
	}
	return allowed, nil
}

func (r *userGroupRepository) GetByID(ctx context.Context, groupID int64) (*service.UserGroup, error) {
	const query = `
		SELECT ug.id, ug.name, ug.description, ug.status, ug.created_by,
		       ug.created_at, ug.updated_at,
		       COUNT(DISTINCT member_users.id), COUNT(DISTINCT viewer_users.id),
		       ug.prompt_capture_enabled, FALSE AS can_view_prompt
		FROM user_groups ug
		LEFT JOIN user_group_members ugm ON ugm.user_group_id = ug.id
		LEFT JOIN users member_users ON member_users.id = ugm.user_id AND member_users.deleted_at IS NULL
		LEFT JOIN user_group_viewer_grants ugvg ON ugvg.user_group_id = ug.id
		LEFT JOIN users viewer_users ON viewer_users.id = ugvg.viewer_user_id AND viewer_users.deleted_at IS NULL
		WHERE ug.id = $1 AND ug.status = 'active'
		GROUP BY ug.id`
	rows, err := r.db.QueryContext(ctx, query, groupID)
	if err != nil {
		return nil, fmt.Errorf("get user group: %w", err)
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("get user group rows: %w", err)
		}
		return nil, service.ErrUserGroupNotFound
	}
	group, err := scanUserGroup(rows)
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *userGroupRepository) Create(ctx context.Context, group service.UserGroup, actorID int64) (*service.UserGroup, error) {
	const query = `
		INSERT INTO user_groups (name, description, status, created_by, created_at, updated_at)
		VALUES ($1, $2, 'active', $3, NOW(), NOW())
		RETURNING id, name, description, status, created_by, created_at, updated_at`
	var created service.UserGroup
	var createdBy sql.NullInt64
	err := r.db.QueryRowContext(ctx, query, group.Name, group.Description, actorID).Scan(
		&created.ID, &created.Name, &created.Description, &created.Status, &createdBy, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		return nil, mapUserGroupRepositoryError(err)
	}
	created.CreatedBy = nullableInt64Pointer(createdBy)
	return &created, nil
}

func (r *userGroupRepository) Update(ctx context.Context, groupID int64, group service.UserGroup) (*service.UserGroup, error) {
	const query = `
		UPDATE user_groups
		SET name = $2, description = $3, updated_at = NOW()
		WHERE id = $1 AND status = 'active'
		RETURNING id, name, description, status, created_by, created_at, updated_at`
	var updated service.UserGroup
	var createdBy sql.NullInt64
	err := r.db.QueryRowContext(ctx, query, groupID, group.Name, group.Description).Scan(
		&updated.ID, &updated.Name, &updated.Description, &updated.Status, &createdBy, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, service.ErrUserGroupNotFound
	}
	if err != nil {
		return nil, mapUserGroupRepositoryError(err)
	}
	updated.CreatedBy = nullableInt64Pointer(createdBy)
	return &updated, nil
}

func (r *userGroupRepository) Archive(ctx context.Context, groupID int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE user_groups SET status = 'archived', prompt_capture_enabled = FALSE, updated_at = NOW() WHERE id = $1 AND status = 'active'`, groupID)
	if err != nil {
		return fmt.Errorf("archive user group: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("archive user group rows affected: %w", err)
	}
	if affected == 0 {
		return service.ErrUserGroupNotFound
	}
	return nil
}

func (r *userGroupRepository) ListMembers(ctx context.Context, groupID int64) ([]service.UserGroupMember, error) {
	const query = `
		SELECT u.id, u.email, u.username, COALESCE(ua.url, ''), u.status, u.balance, ugm.created_at
		FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars ua ON ua.user_id = u.id
		WHERE ugm.user_group_id = $1
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id`
	rows, err := r.db.QueryContext(ctx, query, groupID)
	if err != nil {
		return nil, fmt.Errorf("list user group members: %w", err)
	}
	defer rows.Close()
	members := make([]service.UserGroupMember, 0)
	for rows.Next() {
		var member service.UserGroupMember
		if err := rows.Scan(&member.UserID, &member.Email, &member.Username, &member.AvatarURL, &member.Status, &member.Balance, &member.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan user group member: %w", err)
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (r *userGroupRepository) ReplaceMembers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error {
	return r.replacePeople(ctx, groupID, userIDs, actorID, "user_group_members", "user_id")
}

func (r *userGroupRepository) ListViewers(ctx context.Context, groupID int64) ([]service.UserGroupViewer, error) {
	const query = `
		SELECT u.id, u.email, u.username, COALESCE(ua.url, ''), u.status, ugvg.created_at
		FROM user_group_viewer_grants ugvg
		JOIN users u ON u.id = ugvg.viewer_user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars ua ON ua.user_id = u.id
		WHERE ugvg.user_group_id = $1
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id`
	rows, err := r.db.QueryContext(ctx, query, groupID)
	if err != nil {
		return nil, fmt.Errorf("list user group viewers: %w", err)
	}
	defer rows.Close()
	viewers := make([]service.UserGroupViewer, 0)
	for rows.Next() {
		var viewer service.UserGroupViewer
		if err := rows.Scan(&viewer.UserID, &viewer.Email, &viewer.Username, &viewer.AvatarURL, &viewer.Status, &viewer.GrantedAt); err != nil {
			return nil, fmt.Errorf("scan user group viewer: %w", err)
		}
		viewers = append(viewers, viewer)
	}
	return viewers, rows.Err()
}

func (r *userGroupRepository) ReplaceViewers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error {
	return r.replacePeople(ctx, groupID, userIDs, actorID, "user_group_viewer_grants", "viewer_user_id")
}

func (r *userGroupRepository) replacePeople(ctx context.Context, groupID int64, userIDs []int64, actorID int64, table, userColumn string) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin replace user group people: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	var lockedID int64
	if err = tx.QueryRowContext(ctx, "SELECT id FROM user_groups WHERE id = $1 AND status = 'active' FOR UPDATE", groupID).Scan(&lockedID); errors.Is(err, sql.ErrNoRows) {
		return service.ErrUserGroupNotFound
	} else if err != nil {
		return fmt.Errorf("lock user group: %w", err)
	}
	if len(userIDs) > 0 {
		var count int
		if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ANY($1) AND deleted_at IS NULL", pq.Array(userIDs)).Scan(&count); err != nil {
			return fmt.Errorf("validate user group people: %w", err)
		}
		if count != len(userIDs) {
			return service.ErrUserGroupInvalidUserIDs
		}
	}
	if _, err = tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s WHERE user_group_id = $1", table), groupID); err != nil {
		return fmt.Errorf("clear user group people: %w", err)
	}
	if len(userIDs) > 0 {
		query := fmt.Sprintf(`INSERT INTO %s (user_group_id, %s, created_by, created_at)
			SELECT $1, user_id, $3, NOW() FROM unnest($2::bigint[]) AS user_id`, table, userColumn)
		if _, err = tx.ExecContext(ctx, query, groupID, pq.Array(userIDs), actorID); err != nil {
			return fmt.Errorf("insert user group people: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit replace user group people: %w", err)
	}
	return nil
}

func (r *userGroupRepository) ListSubscriptions(ctx context.Context, groupID int64, query service.UserGroupSubscriptionQuery) (*service.UserGroupSubscriptionResult, error) {
	result := &service.UserGroupSubscriptionResult{Page: query.Page, PageSize: query.PageSize}
	const summarySQL = `
		SELECT COUNT(DISTINCT ugm.user_id),
		       (SELECT COUNT(*) FROM user_subscriptions us JOIN user_group_members m ON m.user_id = us.user_id WHERE m.user_group_id = $1 AND us.deleted_at IS NULL AND us.status = 'active' AND us.expires_at > NOW()),
		       COUNT(DISTINCT ugm.user_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions all_us WHERE all_us.user_id = ugm.user_id AND all_us.deleted_at IS NULL)),
		       COALESCE(SUM(u.balance), 0),
		       COALESCE((SELECT SUM(active_us.daily_usage_usd) FROM user_subscriptions active_us JOIN user_group_members active_m ON active_m.user_id = active_us.user_id WHERE active_m.user_group_id = $1 AND active_us.deleted_at IS NULL AND active_us.status = 'active' AND active_us.expires_at > NOW()), 0)
		FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id AND u.deleted_at IS NULL
		WHERE ugm.user_group_id = $1`
	if err := r.db.QueryRowContext(ctx, summarySQL, groupID).Scan(
		&result.Summary.MemberCount, &result.Summary.ActiveSubscriptionCount, &result.Summary.NoSubscriptionCount,
		&result.Summary.TotalBalance, &result.Summary.ActiveSubscriptionUsage,
	); err != nil {
		return nil, fmt.Errorf("summarize user group subscriptions: %w", err)
	}

	statusCondition, statusArgs := userGroupSubscriptionStatusCondition(query.Status, 2)
	countSQL := `SELECT COUNT(*) FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id AND u.deleted_at IS NULL
		LEFT JOIN user_subscriptions us ON us.user_id = ugm.user_id AND us.deleted_at IS NULL
		WHERE ugm.user_group_id = $1` + statusCondition
	args := []any{groupID}
	args = append(args, statusArgs...)
	if err := r.db.QueryRowContext(ctx, countSQL, args...).Scan(&result.Total); err != nil {
		return nil, fmt.Errorf("count user group subscriptions: %w", err)
	}

	limitPos := len(args) + 1
	offsetPos := limitPos + 1
	rowsSQL := fmt.Sprintf(`
		SELECT u.id, u.email, u.username, COALESCE(ua.url, ''), u.status, u.balance, ugm.created_at,
		       us.id, us.group_id, COALESCE(g.name, ''), COALESCE(g.platform, ''), COALESCE(us.status, ''), us.starts_at, us.expires_at,
		       COALESCE(us.daily_usage_usd, 0), g.daily_limit_usd,
		       COALESCE(us.weekly_usage_usd, 0), g.weekly_limit_usd,
		       COALESCE(us.monthly_usage_usd, 0), g.monthly_limit_usd
		FROM user_group_members ugm
		JOIN users u ON u.id = ugm.user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars ua ON ua.user_id = u.id
		LEFT JOIN user_subscriptions us ON us.user_id = ugm.user_id AND us.deleted_at IS NULL
		LEFT JOIN groups g ON g.id = us.group_id AND g.deleted_at IS NULL
		WHERE ugm.user_group_id = $1%s
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id, us.created_at DESC NULLS LAST
		LIMIT $%d OFFSET $%d`, statusCondition, limitPos, offsetPos)
	args = append(args, query.PageSize, (query.Page-1)*query.PageSize)
	rows, err := r.db.QueryContext(ctx, rowsSQL, args...)
	if err != nil {
		return nil, fmt.Errorf("list user group subscriptions: %w", err)
	}
	defer rows.Close()
	result.Items = make([]service.UserGroupSubscriptionRow, 0)
	for rows.Next() {
		row, err := scanUserGroupSubscriptionRow(rows)
		if err != nil {
			return nil, err
		}
		result.Items = append(result.Items, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list user group subscriptions rows: %w", err)
	}
	result.Pages = pageCount(result.Total, query.PageSize)
	return result, nil
}

func userGroupSubscriptionStatusCondition(status string, _ int) (string, []any) {
	status = strings.TrimSpace(status)
	switch status {
	case "":
		return "", nil
	case "none":
		return " AND us.id IS NULL", nil
	case service.SubscriptionStatusActive:
		return " AND us.status = 'active' AND us.expires_at > NOW()", nil
	case service.SubscriptionStatusExpired:
		return " AND (us.status = 'expired' OR (us.status = 'active' AND us.expires_at <= NOW()))", nil
	default:
		return " AND FALSE", nil
	}
}

func (r *userGroupRepository) GetUsage(ctx context.Context, groupID int64, query service.UserGroupUsageQuery) (*service.UserGroupUsageResult, error) {
	where, args := buildUserGroupUsageWhere(groupID, query)
	result := &service.UserGroupUsageResult{Page: query.Page, PageSize: query.PageSize}
	summarySQL := `
		SELECT COUNT(*), COALESCE(SUM(ul.input_tokens), 0), COALESCE(SUM(ul.output_tokens), 0),
		       COALESCE(SUM(ul.cache_creation_tokens + ul.cache_read_tokens), 0),
		       COALESCE(SUM(ul.input_tokens + ul.output_tokens + ul.cache_creation_tokens + ul.cache_read_tokens), 0),
		       COALESCE(SUM(ul.actual_cost), 0),
		       COALESCE(SUM(CASE WHEN ul.billing_type = 0 THEN ul.actual_cost ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN ul.billing_type = 1 THEN ul.actual_cost ELSE 0 END), 0)
		FROM usage_logs ul
		JOIN user_group_members ugm ON ugm.user_id = ul.user_id
		JOIN users u ON u.id = ul.user_id AND u.deleted_at IS NULL
		WHERE ` + where
	if err := r.db.QueryRowContext(ctx, summarySQL, args...).Scan(
		&result.Summary.TotalRequests, &result.Summary.TotalInputTokens, &result.Summary.TotalOutputTokens,
		&result.Summary.TotalCacheTokens, &result.Summary.TotalTokens, &result.Summary.TotalActualCost,
		&result.Summary.BalanceConsumption, &result.Summary.SubscriptionConsumption,
	); err != nil {
		return nil, fmt.Errorf("summarize user group usage: %w", err)
	}

	byUserSQL := `
		SELECT u.id, u.email, u.username, COUNT(*),
		       COALESCE(SUM(ul.input_tokens + ul.output_tokens + ul.cache_creation_tokens + ul.cache_read_tokens), 0),
		       COALESCE(SUM(ul.actual_cost), 0),
		       COALESCE(SUM(CASE WHEN ul.billing_type = 0 THEN ul.actual_cost ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN ul.billing_type = 1 THEN ul.actual_cost ELSE 0 END), 0)
		FROM usage_logs ul
		JOIN user_group_members ugm ON ugm.user_id = ul.user_id
		JOIN users u ON u.id = ul.user_id AND u.deleted_at IS NULL
		WHERE ` + where + `
		GROUP BY u.id, u.email, u.username
		ORDER BY COALESCE(SUM(ul.actual_cost), 0) DESC, u.id`
	rows, err := r.db.QueryContext(ctx, byUserSQL, args...)
	if err != nil {
		return nil, fmt.Errorf("summarize user group usage by user: %w", err)
	}
	result.ByUser = make([]service.UserGroupUsageByUser, 0)
	for rows.Next() {
		var item service.UserGroupUsageByUser
		if err := rows.Scan(&item.UserID, &item.Email, &item.Username, &item.TotalRequests, &item.TotalTokens, &item.TotalActualCost, &item.BalanceConsumption, &item.SubscriptionConsumption); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan user group usage by user: %w", err)
		}
		result.ByUser = append(result.ByUser, item)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close user group usage by user: %w", err)
	}

	countSQL := `SELECT COUNT(*) FROM usage_logs ul
		JOIN user_group_members ugm ON ugm.user_id = ul.user_id
		JOIN users u ON u.id = ul.user_id AND u.deleted_at IS NULL
		WHERE ` + where
	if err := r.db.QueryRowContext(ctx, countSQL, args...).Scan(&result.Total); err != nil {
		return nil, fmt.Errorf("count user group usage: %w", err)
	}

	limitPos, offsetPos := len(args)+1, len(args)+2
	detailSQL := fmt.Sprintf(`
		SELECT ul.id, u.id, u.email, u.username, ul.request_id,
		       COALESCE(NULLIF(ul.requested_model, ''), ul.model),
		       ul.input_tokens, ul.output_tokens, ul.cache_creation_tokens, ul.cache_read_tokens,
		       ul.actual_cost, ul.billing_type, ul.created_at
		FROM usage_logs ul
		JOIN user_group_members ugm ON ugm.user_id = ul.user_id
		JOIN users u ON u.id = ul.user_id AND u.deleted_at IS NULL
		WHERE %s
		ORDER BY ul.created_at DESC, ul.id DESC
		LIMIT $%d OFFSET $%d`, where, limitPos, offsetPos)
	detailArgs := append(append([]any(nil), args...), query.PageSize, (query.Page-1)*query.PageSize)
	rows, err = r.db.QueryContext(ctx, detailSQL, detailArgs...)
	if err != nil {
		return nil, fmt.Errorf("list user group usage: %w", err)
	}
	defer rows.Close()
	result.Items = make([]service.UserGroupUsageItem, 0)
	for rows.Next() {
		var item service.UserGroupUsageItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.Email, &item.Username, &item.RequestID, &item.Model,
			&item.InputTokens, &item.OutputTokens, &item.CacheCreationTokens, &item.CacheReadTokens,
			&item.ActualCost, &item.BillingType, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user group usage: %w", err)
		}
		item.TotalTokens = item.InputTokens + item.OutputTokens + item.CacheCreationTokens + item.CacheReadTokens
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list user group usage rows: %w", err)
	}
	result.Pages = pageCount(result.Total, query.PageSize)
	return result, nil
}

func buildUserGroupUsageWhere(groupID int64, query service.UserGroupUsageQuery) (string, []any) {
	conditions := []string{"ugm.user_group_id = $1", "ul.created_at >= $2", "ul.created_at < $3"}
	args := []any{groupID, query.StartTime, query.EndTime}
	if query.UserID != nil {
		args = append(args, *query.UserID)
		conditions = append(conditions, fmt.Sprintf("ul.user_id = $%d", len(args)))
	}
	if query.Model != "" {
		args = append(args, query.Model)
		conditions = append(conditions, fmt.Sprintf("COALESCE(NULLIF(ul.requested_model, ''), ul.model) = $%d", len(args)))
	}
	if query.BillingType != nil {
		args = append(args, *query.BillingType)
		conditions = append(conditions, fmt.Sprintf("ul.billing_type = $%d", len(args)))
	}
	return strings.Join(conditions, " AND "), args
}

type userGroupRowScanner interface {
	Scan(dest ...any) error
}

func scanUserGroup(scanner userGroupRowScanner) (service.UserGroup, error) {
	var group service.UserGroup
	var createdBy sql.NullInt64
	if err := scanner.Scan(
		&group.ID, &group.Name, &group.Description, &group.Status, &createdBy,
		&group.CreatedAt, &group.UpdatedAt, &group.MemberCount, &group.ViewerCount,
		&group.PromptCaptureEnabled, &group.CanViewPrompt,
	); err != nil {
		return service.UserGroup{}, fmt.Errorf("scan user group: %w", err)
	}
	group.CreatedBy = nullableInt64Pointer(createdBy)
	return group, nil
}

func scanUserGroupSubscriptionRow(scanner userGroupRowScanner) (service.UserGroupSubscriptionRow, error) {
	var row service.UserGroupSubscriptionRow
	var subscriptionID, billingGroupID sql.NullInt64
	var startsAt, expiresAt sql.NullTime
	var dailyLimit, weeklyLimit, monthlyLimit sql.NullFloat64
	if err := scanner.Scan(
		&row.Member.UserID, &row.Member.Email, &row.Member.Username, &row.Member.AvatarURL, &row.Member.Status, &row.Member.Balance, &row.Member.JoinedAt,
		&subscriptionID, &billingGroupID, &row.BillingGroup, &row.Platform, &row.Status, &startsAt, &expiresAt,
		&row.DailyUsed, &dailyLimit, &row.WeeklyUsed, &weeklyLimit, &row.MonthlyUsed, &monthlyLimit,
	); err != nil {
		return service.UserGroupSubscriptionRow{}, fmt.Errorf("scan user group subscription: %w", err)
	}
	row.SubscriptionID = nullableInt64Pointer(subscriptionID)
	row.BillingGroupID = nullableInt64Pointer(billingGroupID)
	row.StartsAt = nullableTimePointer(startsAt)
	row.ExpiresAt = nullableTimePointer(expiresAt)
	row.DailyLimit = nullableFloat64Pointer(dailyLimit)
	row.WeeklyLimit = nullableFloat64Pointer(weeklyLimit)
	row.MonthlyLimit = nullableFloat64Pointer(monthlyLimit)
	return row, nil
}

func nullableInt64Pointer(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	return &value.Int64
}

func nullableTimePointer(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

func nullableFloat64Pointer(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}

func pageCount(total int64, pageSize int) int {
	if pageSize <= 0 || total <= 0 {
		return 0
	}
	return int((total + int64(pageSize) - 1) / int64(pageSize))
}

func mapUserGroupRepositoryError(err error) error {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && pqErr.Code == "23505" {
		return infraerrors.Conflict("USER_GROUP_NAME_CONFLICT", "An active user group with this name already exists").WithCause(err)
	}
	return fmt.Errorf("persist user group: %w", err)
}

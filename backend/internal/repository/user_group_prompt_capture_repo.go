package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

type userGroupPromptCaptureRepository struct {
	db *sql.DB
}

func NewUserGroupPromptCaptureRepository(db *sql.DB) service.UserGroupPromptCaptureRepository {
	return &userGroupPromptCaptureRepository{db: db}
}

func (r *userGroupPromptCaptureRepository) LoadEligibility(ctx context.Context) (map[int64][]int64, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ugm.user_id, ugm.user_group_id
		FROM user_group_members ugm
		JOIN user_groups ug ON ug.id = ugm.user_group_id
		JOIN users u ON u.id = ugm.user_id AND u.deleted_at IS NULL
		JOIN user_group_quota_policies policy ON policy.user_group_id = ugm.user_group_id AND policy.enabled = TRUE
		JOIN user_group_quota_members quota ON quota.user_group_id = ugm.user_group_id AND quota.user_id = ugm.user_id AND quota.weekly_limit_usd > 0
		WHERE ug.status = 'active' AND ug.prompt_capture_enabled = TRUE
		  AND EXISTS (SELECT 1 FROM user_group_team_subscription_groups mapping WHERE mapping.user_group_id = ugm.user_group_id)
		ORDER BY ugm.user_id, ugm.user_group_id`)
	if err != nil {
		return nil, fmt.Errorf("load user group prompt eligibility: %w", err)
	}
	defer rows.Close()
	result := make(map[int64][]int64)
	for rows.Next() {
		var userID, groupID int64
		if err := rows.Scan(&userID, &groupID); err != nil {
			return nil, fmt.Errorf("scan user group prompt eligibility: %w", err)
		}
		result[userID] = append(result[userID], groupID)
	}
	return result, rows.Err()
}

func (r *userGroupPromptCaptureRepository) SetCaptureEnabled(ctx context.Context, groupID int64, enabled bool) error {
	result, err := r.db.ExecContext(ctx, `UPDATE user_groups
		SET prompt_capture_enabled=$2, updated_at=NOW()
		WHERE id=$1 AND status='active'`, groupID, enabled)
	if err != nil {
		return fmt.Errorf("update user group prompt capture: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count updated user group prompt capture rows: %w", err)
	}
	if count != 1 {
		return service.ErrUserGroupNotFound
	}
	return nil
}

func (r *userGroupPromptCaptureRepository) ListPromptViewers(ctx context.Context, groupID int64) ([]service.UserGroupViewer, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.id, u.email, u.username, COALESCE(ua.url, ''), u.status, ugpvg.created_at
		FROM user_group_prompt_viewer_grants ugpvg
		JOIN users u ON u.id = ugpvg.viewer_user_id AND u.deleted_at IS NULL
		LEFT JOIN user_avatars ua ON ua.user_id = u.id
		WHERE ugpvg.user_group_id = $1
		ORDER BY LOWER(COALESCE(NULLIF(u.username, ''), u.email)), u.id`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list user group prompt viewers: %w", err)
	}
	defer rows.Close()
	viewers := make([]service.UserGroupViewer, 0)
	for rows.Next() {
		var viewer service.UserGroupViewer
		if err := rows.Scan(&viewer.UserID, &viewer.Email, &viewer.Username, &viewer.AvatarURL, &viewer.Status, &viewer.GrantedAt); err != nil {
			return nil, fmt.Errorf("scan user group prompt viewer: %w", err)
		}
		viewers = append(viewers, viewer)
	}
	return viewers, rows.Err()
}

func (r *userGroupPromptCaptureRepository) ReplacePromptViewers(ctx context.Context, groupID int64, userIDs []int64, actorID int64) error {
	groupRepo := &userGroupRepository{db: r.db}
	return groupRepo.replacePeople(ctx, groupID, userIDs, actorID, "user_group_prompt_viewer_grants", "viewer_user_id")
}

func (r *userGroupPromptCaptureRepository) CanViewPrompt(ctx context.Context, groupID, actorID int64) (bool, error) {
	var allowed bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM user_group_prompt_viewer_grants ugpvg
		JOIN user_groups ug ON ug.id = ugpvg.user_group_id AND ug.status = 'active'
		WHERE ugpvg.user_group_id=$1 AND ugpvg.viewer_user_id=$2
	)`, groupID, actorID).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("check user group prompt access: %w", err)
	}
	return allowed, nil
}

func (r *userGroupPromptCaptureRepository) InsertCapture(ctx context.Context, capture service.UserPromptCaptureWrite) (err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin user prompt capture: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	var captureID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO user_prompt_captures (
			event_id, request_id, user_id, protocol, model, stage, redacted_prompt,
			prompt_hash, prompt_length, truncated, captured_at, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (event_id) DO UPDATE SET event_id=EXCLUDED.event_id
		RETURNING id`,
		capture.EventID, capture.RequestID, capture.UserID, capture.Protocol, capture.Model, capture.Stage,
		capture.RedactedPrompt, capture.PromptHash, capture.PromptLength, capture.Truncated,
		capture.CapturedAt.UTC(), capture.ExpiresAt.UTC()).Scan(&captureID)
	if err != nil {
		return fmt.Errorf("insert user prompt capture: %w", err)
	}
	groupIDs := canonicalInt64s(capture.GroupIDs)
	if len(groupIDs) == 0 {
		return errors.New("user prompt capture requires a business group")
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO user_group_prompt_captures (capture_id, user_group_id)
		SELECT $1, ul.business_user_group_id
		FROM usage_logs ul
		WHERE ul.user_id=$3 AND ul.request_id=$4
		  AND ul.business_user_group_id = ANY($2::bigint[])
		ON CONFLICT DO NOTHING`, captureID, pq.Array(groupIDs), capture.UserID, capture.RequestID)
	if err != nil {
		return fmt.Errorf("associate user prompt capture groups: %w", err)
	}
	if linked, rowsErr := result.RowsAffected(); rowsErr != nil {
		return fmt.Errorf("count associated user prompt capture groups: %w", rowsErr)
	} else if linked > 0 {
		if _, err = tx.ExecContext(ctx, `UPDATE user_prompt_captures SET expires_at=captured_at + INTERVAL '14 days' WHERE id=$1`, captureID); err != nil {
			return fmt.Errorf("extend committed user prompt capture retention: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit user prompt capture: %w", err)
	}
	return nil
}

func (r *userGroupPromptCaptureRepository) PromptAvailableForUsage(ctx context.Context, groupID, usageLogID int64) (bool, error) {
	var available bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1
		FROM usage_logs ul
		JOIN user_prompt_captures upc ON upc.user_id=ul.user_id AND upc.request_id=ul.request_id
		JOIN user_group_prompt_captures ugpc ON ugpc.capture_id=upc.id
		WHERE ugpc.user_group_id=$1 AND ul.id=$2
		  AND ul.business_user_group_id=$1 AND upc.expires_at > NOW()
	)`, groupID, usageLogID).Scan(&available)
	if err != nil {
		return false, fmt.Errorf("check user group prompt availability: %w", err)
	}
	return available, nil
}

func (r *userGroupPromptCaptureRepository) ListUsagePrompts(ctx context.Context, groupID, usageLogID int64) ([]service.UserPromptCaptureDetail, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT upc.id, upc.request_id, upc.protocol, upc.model, upc.stage, upc.redacted_prompt,
		       upc.prompt_length, upc.truncated, upc.captured_at, upc.expires_at
		FROM user_prompt_captures upc
		JOIN usage_logs ul ON ul.user_id = upc.user_id AND ul.request_id = upc.request_id
		JOIN user_group_prompt_captures ugpc ON ugpc.capture_id = upc.id
		WHERE ugpc.user_group_id = $1 AND ul.id = $2
		  AND ul.business_user_group_id = $1 AND upc.expires_at > NOW()
		ORDER BY upc.captured_at, upc.id`, groupID, usageLogID)
	if err != nil {
		return nil, fmt.Errorf("list user group usage prompts: %w", err)
	}
	defer rows.Close()
	items := make([]service.UserPromptCaptureDetail, 0)
	for rows.Next() {
		var item service.UserPromptCaptureDetail
		if err := rows.Scan(&item.ID, &item.RequestID, &item.Protocol, &item.Model, &item.Stage, &item.RedactedPrompt,
			&item.PromptLength, &item.Truncated, &item.CapturedAt, &item.ExpiresAt); err != nil {
			return nil, fmt.Errorf("scan user group usage prompt: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *userGroupPromptCaptureRepository) DeleteExpiredBatch(ctx context.Context, now time.Time, limit int) (int64, error) {
	if limit < 1 || limit > 5000 {
		limit = 1000
	}
	result, err := r.db.ExecContext(ctx, `
		WITH expired AS (
			SELECT id FROM user_prompt_captures
			WHERE expires_at <= $1
			ORDER BY expires_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT $2
		)
		DELETE FROM user_prompt_captures upc USING expired WHERE upc.id=expired.id`, now.UTC(), limit)
	if err != nil {
		return 0, fmt.Errorf("delete expired user prompt captures: %w", err)
	}
	return result.RowsAffected()
}

func canonicalInt64s(values []int64) []int64 {
	seen := make(map[int64]struct{}, len(values))
	for _, value := range values {
		if value > 0 {
			seen[value] = struct{}{}
		}
	}
	result := make([]int64, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

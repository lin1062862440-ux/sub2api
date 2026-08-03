package migrations

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserGroupsMigration(t *testing.T) {
	content, err := FS.ReadFile("192_user_groups.sql")
	require.NoError(t, err)

	sql := strings.Join(strings.Fields(string(content)), " ")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_groups")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_group_members")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_group_viewer_grants")
	require.Contains(t, sql, "PRIMARY KEY (user_group_id, user_id)")
	require.Contains(t, sql, "PRIMARY KEY (user_group_id, viewer_user_id)")
	require.Contains(t, sql, "LOWER(name)")
	require.NotContains(t, sql, "idx_usage_logs_user_created_desc")
}

func TestUserGroupPromptCaptureMigration(t *testing.T) {
	content, err := FS.ReadFile("194_user_group_prompt_capture.sql")
	require.NoError(t, err)

	sql := strings.Join(strings.Fields(string(content)), " ")
	require.Contains(t, sql, "ADD COLUMN IF NOT EXISTS prompt_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_group_prompt_viewer_grants")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_prompt_captures")
	require.Contains(t, sql, "CREATE TABLE IF NOT EXISTS user_group_prompt_captures")
	require.Contains(t, sql, "event_id UUID NOT NULL UNIQUE")
	require.Contains(t, sql, "expires_at TIMESTAMPTZ NOT NULL")
	require.Contains(t, sql, "ON DELETE CASCADE")
	require.Contains(t, sql, "idx_user_prompt_captures_lookup")
	require.Contains(t, sql, "idx_user_prompt_captures_expiry")
	require.Contains(t, sql, "idx_user_group_prompt_captures_group")
	require.NotContains(t, sql, "ALTER TABLE prompt_audit_events")
}

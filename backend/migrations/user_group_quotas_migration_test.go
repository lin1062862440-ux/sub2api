package migrations

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserGroupQuotaMigrationDefinesPoolAndUniqueMemberAssignment(t *testing.T) {
	sql, err := FS.ReadFile("195_user_group_quotas.sql")
	require.NoError(t, err)
	content := string(sql)
	require.Contains(t, content, "CREATE TABLE IF NOT EXISTS user_group_quota_policies")
	require.Contains(t, content, "CREATE TABLE IF NOT EXISTS user_group_quota_managers")
	require.Contains(t, content, "CREATE TABLE IF NOT EXISTS user_group_quota_members")
	require.Contains(t, content, "CREATE TABLE IF NOT EXISTS user_group_team_subscription_groups")
	require.Contains(t, content, "ADD COLUMN IF NOT EXISTS owner_user_group_id")
	require.Contains(t, content, "ADD COLUMN IF NOT EXISTS business_user_group_id")
	require.Contains(t, content, "CREATE TRIGGER trg_usage_logs_link_team_prompt_capture")
	require.Contains(t, content, "NEW.business_user_group_id")
	require.Contains(t, content, "user_id                BIGINT PRIMARY KEY")
	require.Contains(t, content, "REFERENCES user_group_members(user_group_id, user_id)")
}

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

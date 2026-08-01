-- Business-level user groups for delegated H5 reporting.
-- These tables are intentionally separate from the API billing/model `groups` table.

CREATE TABLE IF NOT EXISTS user_groups (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_groups_active_name_unique
    ON user_groups (LOWER(name))
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_groups_status_updated
    ON user_groups (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_group_members (
    user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_members_user
    ON user_group_members (user_id, user_group_id);

CREATE TABLE IF NOT EXISTS user_group_viewer_grants (
    user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    viewer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_group_id, viewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_viewer_grants_viewer
    ON user_group_viewer_grants (viewer_user_id, user_group_id);

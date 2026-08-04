-- Weekly quota pools for business-level user groups.
-- Quota windows are aligned to Monday 00:00 in Asia/Shanghai.

ALTER TABLE groups
    ALTER COLUMN subscription_type TYPE VARCHAR(24);

CREATE TABLE IF NOT EXISTS user_group_team_subscription_groups (
    user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    billing_group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
    platform VARCHAR(50) NOT NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_group_id, billing_group_id),
    CONSTRAINT uq_user_group_team_subscription_platform UNIQUE (user_group_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_user_group_team_subscription_billing_group
    ON user_group_team_subscription_groups (billing_group_id, user_group_id);

ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS owner_user_group_id BIGINT REFERENCES user_groups(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_owner_user_group
    ON user_subscriptions (owner_user_group_id, user_id, status)
    WHERE owner_user_group_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE usage_logs
    ADD COLUMN IF NOT EXISTS business_user_group_id BIGINT REFERENCES user_groups(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_business_user_group_created
    ON usage_logs (business_user_group_id, created_at DESC, id DESC)
    WHERE business_user_group_id IS NOT NULL;

-- Prompt snapshots are staged before upstream completion. Only a successful usage row
-- attributed to a team subscription promotes the snapshot into the business group.
CREATE OR REPLACE FUNCTION link_team_prompt_capture_from_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.business_user_group_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO user_group_prompt_captures (capture_id, user_group_id)
    SELECT capture.id, NEW.business_user_group_id
    FROM user_prompt_captures capture
    JOIN user_groups ug ON ug.id = NEW.business_user_group_id
                       AND ug.status = 'active'
                       AND ug.prompt_capture_enabled = TRUE
    WHERE capture.user_id = NEW.user_id
      AND capture.request_id = NEW.request_id
      AND capture.expires_at > NOW()
    ON CONFLICT DO NOTHING;

    UPDATE user_prompt_captures capture
    SET expires_at = capture.captured_at + INTERVAL '14 days'
    WHERE capture.user_id = NEW.user_id
      AND capture.request_id = NEW.request_id
      AND EXISTS (
          SELECT 1 FROM user_group_prompt_captures linked
          WHERE linked.capture_id = capture.id
            AND linked.user_group_id = NEW.business_user_group_id
      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usage_logs_link_team_prompt_capture ON usage_logs;
CREATE TRIGGER trg_usage_logs_link_team_prompt_capture
AFTER INSERT ON usage_logs
FOR EACH ROW
EXECUTE FUNCTION link_team_prompt_capture_from_usage();

CREATE TABLE IF NOT EXISTS user_group_quota_policies (
    user_group_id          BIGINT PRIMARY KEY REFERENCES user_groups(id) ON DELETE CASCADE,
    enabled                BOOLEAN NOT NULL DEFAULT FALSE,
    weekly_limit_usd       NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (weekly_limit_usd >= 0),
    weekly_usage_usd       NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (weekly_usage_usd >= 0),
    weekly_window_start    TIMESTAMPTZ,
    updated_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_group_quota_policies_enabled
    ON user_group_quota_policies (enabled, user_group_id)
    WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS user_group_quota_managers (
    user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_quota_managers_user
    ON user_group_quota_managers (user_id, user_group_id);

CREATE TABLE IF NOT EXISTS user_group_quota_members (
    user_id                BIGINT PRIMARY KEY,
    user_group_id          BIGINT NOT NULL,
    weekly_limit_usd       NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (weekly_limit_usd >= 0),
    weekly_usage_usd       NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (weekly_usage_usd >= 0),
    weekly_window_start    TIMESTAMPTZ,
    updated_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_group_quota_member_membership
        FOREIGN KEY (user_group_id, user_id)
        REFERENCES user_group_members(user_group_id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_user_group_quota_member_group_user UNIQUE (user_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_quota_members_group
    ON user_group_quota_members (user_group_id, user_id);

-- Short-lived, independently authorized Prompt capture for business user groups.
-- This storage is separate from prompt_audit_events and never stores raw prompts.

ALTER TABLE user_groups
    ADD COLUMN IF NOT EXISTS prompt_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_group_prompt_viewer_grants (
    user_group_id  BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    viewer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_group_id, viewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_prompt_viewers_viewer
    ON user_group_prompt_viewer_grants (viewer_user_id, user_group_id);

CREATE TABLE IF NOT EXISTS user_prompt_captures (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE,
    request_id      VARCHAR(128) NOT NULL,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    protocol        VARCHAR(64) NOT NULL DEFAULT '',
    model           VARCHAR(255) NOT NULL DEFAULT '',
    stage           VARCHAR(32) NOT NULL DEFAULT 'http',
    redacted_prompt TEXT NOT NULL,
    prompt_hash     VARCHAR(64) NOT NULL,
    prompt_length   INT NOT NULL,
    truncated       BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at     TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_prompt_captures_prompt
        CHECK (prompt_length >= 0 AND redacted_prompt <> ''),
    CONSTRAINT chk_user_prompt_captures_expiry
        CHECK (expires_at > captured_at)
);

CREATE INDEX IF NOT EXISTS idx_user_prompt_captures_lookup
    ON user_prompt_captures (user_id, request_id, captured_at, id);
CREATE INDEX IF NOT EXISTS idx_user_prompt_captures_expiry
    ON user_prompt_captures (expires_at, id);

CREATE TABLE IF NOT EXISTS user_group_prompt_captures (
    capture_id    BIGINT NOT NULL REFERENCES user_prompt_captures(id) ON DELETE CASCADE,
    user_group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (capture_id, user_group_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_prompt_captures_group
    ON user_group_prompt_captures (user_group_id, capture_id);

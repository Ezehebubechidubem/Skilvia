-- ============================================================
-- SKILVIA REFRESH TOKEN STORAGE
-- Migration: 001
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_family UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    replaced_by_hash CHAR(64) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NULL,

    CONSTRAINT refresh_token_hash_format
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT refresh_replacement_hash_format
        CHECK (
            replaced_by_hash IS NULL
            OR replaced_by_hash ~ '^[a-f0-9]{64}$'
        )
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family
    ON refresh_tokens (token_family);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_user
    ON refresh_tokens (user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiration
    ON refresh_tokens (expires_at);
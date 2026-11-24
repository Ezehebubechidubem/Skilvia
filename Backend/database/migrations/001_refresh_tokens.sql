
-- ============================================
-- SKILVIA REFRESH TOKEN SECURITY
-- Migration: 001_refresh_tokens.sql
-- ============================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ID of the account that owns this session.
    -- TEXT allows compatibility with our planned user ID
    -- structure until the users table is finalized.
    user_id TEXT NOT NULL,

    -- SHA-256 hash of the refresh token.
    -- The original token is never stored.
    token_hash CHAR(64) NOT NULL UNIQUE,

    -- Tokens from the same login session share a family.
    token_family UUID NOT NULL,

    -- Expiration of the refresh token.
    expires_at TIMESTAMPTZ NOT NULL,

    -- NULL means the token has not been revoked.
    revoked_at TIMESTAMPTZ DEFAULT NULL,

    -- Hash of the replacement token after rotation.
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

-- ============================================
-- INDEXES
-- ============================================

-- Find all sessions belonging to a user.
CREATE INDEX IF NOT EXISTS
    idx_refresh_tokens_user_id
ON refresh_tokens (user_id);

-- Find all tokens belonging to a login session.
CREATE INDEX IF NOT EXISTS
    idx_refresh_tokens_family
ON refresh_tokens (token_family);

-- Find active sessions belonging to a user.
CREATE INDEX IF NOT EXISTS
    idx_refresh_tokens_active_user
ON refresh_tokens (user_id, expires_at)
WHERE revoked_at IS NULL;

-- Find expired tokens for cleanup.
CREATE INDEX IF NOT EXISTS
    idx_refresh_tokens_expiration
ON refresh_tokens (expires_at);

-- ============================================
-- END OF MIGRATION
-- ============================================

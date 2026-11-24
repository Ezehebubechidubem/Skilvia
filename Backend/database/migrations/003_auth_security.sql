
-- ============================================
-- SKILVIA AUTHENTICATION SECURITY
-- Migration: 003_auth_security.sql
-- ============================================

-- ============================================
-- 1. EMAIL VERIFICATION TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    token_hash CHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT email_verification_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT email_verification_token_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT email_verification_user_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS
    idx_email_verification_user
ON email_verification_tokens (user_id);

CREATE INDEX IF NOT EXISTS
    idx_email_verification_expiry
ON email_verification_tokens (expires_at);


-- ============================================
-- 2. PASSWORD RESET TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    token_hash CHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ DEFAULT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT password_reset_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT password_reset_token_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT password_reset_user_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS
    idx_password_reset_user
ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS
    idx_password_reset_expiry
ON password_reset_tokens (expires_at);


-- ============================================
-- 3. END OF MIGRATION
-- ============================================


-- ============================================
-- SKILVIA USERS DATABASE
-- Migration: 002_users.sql
-- ============================================

-- ============================================
-- 1. MAIN USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(254) NOT NULL,

    phone VARCHAR(32),

    password_hash VARCHAR(255) NOT NULL,

    -- Account roles
    role VARCHAR(20) NOT NULL DEFAULT 'customer',

    -- Account status
    account_status VARCHAR(30) NOT NULL DEFAULT 'active',

    -- Verification records
    email_verified_at TIMESTAMPTZ DEFAULT NULL,

    phone_verified_at TIMESTAMPTZ DEFAULT NULL,

    -- Login tracking
    last_login_at TIMESTAMPTZ DEFAULT NULL,

    -- Account timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check
        CHECK (
            role IN (
                'customer',
                'professional',
                'admin'
            )
        ),

    CONSTRAINT users_status_check
        CHECK (
            account_status IN (
                'active',
                'suspended',
                'deactivated'
            )
        ),

    CONSTRAINT users_full_name_check
        CHECK (char_length(trim(full_name)) >= 2),

    CONSTRAINT users_email_check
        CHECK (email = trim(email))
);

-- ============================================
-- 2. UNIQUE EMAIL INDEX
-- ============================================

-- Email addresses are treated as case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_email_unique
ON users (LOWER(email));

-- ============================================
-- 3. UNIQUE PHONE INDEX
-- ============================================

-- Allows users without a phone number during
-- registration, but prevents duplicate numbers.
CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_phone_unique
ON users (phone)
WHERE phone IS NOT NULL;

-- ============================================
-- 4. ACCOUNT LOOKUP INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS
    idx_users_role
ON users (role);

CREATE INDEX IF NOT EXISTS
    idx_users_account_status
ON users (account_status);

CREATE INDEX IF NOT EXISTS
    idx_users_created_at
ON users (created_at DESC);

-- ============================================
-- 5. AUTOMATIC UPDATED_AT TIMESTAMP
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS
    trigger_users_updated_at
ON users;

CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. CONNECT REFRESH TOKENS TO USERS
-- ============================================

-- Convert the refresh token user_id column
-- from TEXT to UUID.

ALTER TABLE refresh_tokens
ALTER COLUMN user_id TYPE UUID
USING user_id::UUID;

-- Ensure every refresh token belongs to a real user.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'refresh_tokens_user_id_fkey'
    ) THEN
        ALTER TABLE refresh_tokens
        ADD CONSTRAINT refresh_tokens_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
    END IF;
END;
$$;

-- ============================================
-- 7. ADDITIONAL SESSION INDEX
-- ============================================

CREATE INDEX IF NOT EXISTS
    idx_refresh_tokens_user_active
ON refresh_tokens (user_id, expires_at)
WHERE revoked_at IS NULL;

-- ============================================
-- END OF MIGRATION
-- ============================================

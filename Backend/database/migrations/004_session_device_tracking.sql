
-- =====================================
-- SKILVIA SESSION DEVICE TRACKING
-- Migration: 004
-- =====================================

-- Device information
ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS device_name VARCHAR(150);

ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS device_type VARCHAR(30);

ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Record the last IP address used by the session.
ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS last_ip_address INET;

-- Track when a session was last active.
ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Record why a session was revoked.
ALTER TABLE refresh_tokens
ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(50);

-- =====================================
-- DEVICE TYPE VALIDATION
-- =====================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'refresh_tokens_device_type_check'
          AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
        ADD CONSTRAINT refresh_tokens_device_type_check
        CHECK (
            device_type IS NULL
            OR device_type IN (
                'android',
                'ios',
                'web',
                'desktop',
                'unknown'
            )
        );
    END IF;
END;
$$;

-- =====================================
-- REVOCATION REASON VALIDATION
-- =====================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'refresh_tokens_revoked_reason_check'
          AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
        ADD CONSTRAINT refresh_tokens_revoked_reason_check
        CHECK (
            revoked_reason IS NULL
            OR revoked_reason IN (
                'user_logout',
                'logout_all',
                'password_change',
                'password_reset',
                'admin_action',
                'token_reuse',
                'account_suspension'
            )
        );
    END IF;
END;
$$;

-- =====================================
-- SESSION MANAGEMENT INDEXES
-- =====================================

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_sessions
ON refresh_tokens (
    user_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_sessions
ON refresh_tokens (
    user_id,
    expires_at
)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_last_seen
ON refresh_tokens (
    user_id,
    last_seen_at DESC
);

-- =====================================
-- MIGRATION COMPLETE
-- =====================================

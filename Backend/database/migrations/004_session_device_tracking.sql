-- ============================================================
-- 004_session_device_tracking.sql
-- ============================================================
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_name VARCHAR(150);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_type VARCHAR(30);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_ip_address INET;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(50);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'refresh_tokens_device_type_check'
           AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_device_type_check
            CHECK (device_type IS NULL OR device_type IN ('android', 'ios', 'web', 'desktop', 'unknown'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'refresh_tokens_revoked_reason_check'
           AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_revoked_reason_check
            CHECK (revoked_reason IS NULL OR revoked_reason IN (
                'user_logout', 'logout_all', 'password_change', 'password_reset',
                'admin_action', 'token_reuse', 'account_suspension'
            ));
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_sessions
    ON refresh_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_sessions
    ON refresh_tokens (user_id, expires_at)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_last_seen
    ON refresh_tokens (user_id, last_seen_at DESC);

COMMIT;

-- Verification: these should return the core authentication tables.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = current_schema()
   AND table_type = 'BASE TABLE'
   AND table_name IN (
       'users',
       'refresh_tokens',
       'email_verification_tokens',
       'password_reset_tokens'
   )
 ORDER BY table_name;

-- Expected account roles supported by the users table.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND table_name = 'users'
 ORDER BY ordinal_position;

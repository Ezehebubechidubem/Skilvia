-- ============================================================
-- 002_users.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer',
    account_status VARCHAR(30) NOT NULL DEFAULT 'active',
    email_verified_at TIMESTAMPTZ DEFAULT NULL,
    phone_verified_at TIMESTAMPTZ DEFAULT NULL,
    last_login_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_role_check
        CHECK (role IN ('customer', 'professional', 'admin')),
    CONSTRAINT users_status_check
        CHECK (account_status IN ('active', 'suspended', 'deactivated')),
    CONSTRAINT users_full_name_check
        CHECK (char_length(trim(full_name)) >= 2),
    CONSTRAINT users_email_check
        CHECK (email = trim(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users (phone)
    WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Convert refresh_tokens.user_id to UUID only when needed.
-- Stop safely rather than silently discarding or changing non-UUID session owners.
DO $$
DECLARE
    user_id_data_type TEXT;
BEGIN
    SELECT data_type
      INTO user_id_data_type
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'refresh_tokens'
       AND column_name = 'user_id';

    IF user_id_data_type IS NULL THEN
        RAISE EXCEPTION 'SKILVIA repair stopped: refresh_tokens.user_id column is missing.';
    END IF;

    IF user_id_data_type <> 'uuid' THEN
        IF EXISTS (
            SELECT 1
              FROM refresh_tokens
             WHERE user_id IS NULL
                OR user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ) THEN
            RAISE EXCEPTION 'SKILVIA repair stopped: refresh_tokens contains non-UUID user_id values. No migration changes were committed.';
        END IF;

        ALTER TABLE refresh_tokens
            ALTER COLUMN user_id TYPE UUID
            USING user_id::UUID;
    END IF;
END;
$$;

-- Do not attach old refresh-token rows to the wrong or missing account.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM refresh_tokens AS rt
          LEFT JOIN users AS u ON u.id = rt.user_id
         WHERE u.id IS NULL
    ) THEN
        RAISE EXCEPTION 'SKILVIA repair stopped: refresh_tokens contains sessions without matching users. Review those rows before adding the user foreign key.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'refresh_tokens_user_id_fkey'
           AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_user_id_fkey
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
    ON refresh_tokens (user_id, expires_at)
    WHERE revoked_at IS NULL;
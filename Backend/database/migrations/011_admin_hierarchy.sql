
BEGIN;

-- =====================================================
-- 1. ADD ADMINISTRATOR DESIGNATION
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_type VARCHAR(20);


-- =====================================================
-- 2. CLASSIFY EXISTING ADMIN ACCOUNTS
-- =====================================================

UPDATE users
SET admin_type = 'sub_admin'
WHERE role = 'admin'
  AND admin_type IS NULL;


-- =====================================================
-- 3. ENFORCE VALID ADMIN DESIGNATIONS
-- =====================================================

ALTER TABLE users
ADD CONSTRAINT users_admin_type_check
CHECK (
  (
    role = 'admin'
    AND admin_type IN ('super_admin', 'sub_admin')
  )
  OR
  (
    role <> 'admin'
    AND admin_type IS NULL
  )
);


-- =====================================================
-- 4. ALLOW ONLY ONE SUPER ADMIN
-- =====================================================

CREATE UNIQUE INDEX users_single_super_admin_idx
ON users (admin_type)
WHERE role = 'admin'
  AND admin_type = 'super_admin';


-- =====================================================
-- 5. INDEX ADMINISTRATOR LOOKUPS
-- =====================================================

CREATE INDEX users_admin_type_status_idx
ON users (admin_type, account_status)
WHERE role = 'admin';


COMMIT;

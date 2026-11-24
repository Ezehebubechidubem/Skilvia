
-- =====================================================
-- SKILVIA ADMINISTRATOR PERMISSIONS
-- Migration: 009_admin_permissions.sql
-- =====================================================

BEGIN;


-- =====================================================
-- 1. ADMIN PERMISSIONS CATALOGUE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    permission_key VARCHAR(150) NOT NULL UNIQUE,

    permission_name VARCHAR(150) NOT NULL,

    description TEXT,

    permission_category VARCHAR(100) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT admin_permissions_key_format
      CHECK (
        permission_key ~ '^[a-z][a-z0-9_.]*$'
      )
);


-- =====================================================
-- 2. ADMINISTRATOR PERMISSION ASSIGNMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    admin_user_id UUID NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    permission_id UUID NOT NULL
      REFERENCES admin_permissions(id)
      ON DELETE RESTRICT,

    granted_by UUID
      REFERENCES users(id)
      ON DELETE SET NULL,

    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ,

    CONSTRAINT admin_user_permissions_unique
      UNIQUE (admin_user_id, permission_id),

    CONSTRAINT admin_user_permissions_expiry
      CHECK (
        expires_at IS NULL
        OR expires_at > granted_at
      )
);


-- =====================================================
-- 3. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS
  idx_admin_permissions_category
ON admin_permissions(permission_category);

CREATE INDEX IF NOT EXISTS
  idx_admin_permissions_active
ON admin_permissions(is_active);

CREATE INDEX IF NOT EXISTS
  idx_admin_user_permissions_admin
ON admin_user_permissions(admin_user_id);

CREATE INDEX IF NOT EXISTS
  idx_admin_user_permissions_permission
ON admin_user_permissions(permission_id);

CREATE INDEX IF NOT EXISTS
  idx_admin_user_permissions_expiry
ON admin_user_permissions(expires_at);


-- =====================================================
-- 4. ENSURE ONLY ADMIN ACCOUNTS RECEIVE PERMISSIONS
-- =====================================================

CREATE OR REPLACE FUNCTION
  validate_admin_permission_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM users
        WHERE id = NEW.admin_user_id
          AND role = 'admin'
          AND account_status = 'active'
    ) THEN
        RAISE EXCEPTION
          'Permissions can only be assigned to active administrator accounts.';
    END IF;

    IF NEW.granted_by IS NOT NULL
       AND NOT EXISTS (
          SELECT 1
          FROM users
          WHERE id = NEW.granted_by
            AND role = 'admin'
            AND account_status = 'active'
       )
    THEN
        RAISE EXCEPTION
          'Permission grants must be performed by an active administrator.';
    END IF;

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
  trg_validate_admin_permission_assignment
ON admin_user_permissions;

CREATE TRIGGER
  trg_validate_admin_permission_assignment
BEFORE INSERT OR UPDATE
ON admin_user_permissions
FOR EACH ROW
EXECUTE FUNCTION
  validate_admin_permission_assignment();


-- =====================================================
-- 5. INITIAL ADMIN PERMISSIONS
-- =====================================================

INSERT INTO admin_permissions (
    permission_key,
    permission_name,
    description,
    permission_category
)
VALUES

-- PLATFORM SETTINGS

(
    'admin.settings.read',
    'View Platform Settings',
    'View platform configuration and business settings.',
    'platform_settings'
),

(
    'admin.settings.write',
    'Edit Platform Settings',
    'Create new versions of editable platform settings.',
    'platform_settings'
),

(
    'admin.settings.schedule',
    'Schedule Platform Changes',
    'Schedule future platform setting changes.',
    'platform_settings'
),


-- ADMIN AUDIT

(
    'admin.audit.read',
    'View Audit Logs',
    'Review administrator actions and audit records.',
    'audit'
),


-- CATEGORY MANAGEMENT

(
    'admin.categories.read',
    'View Categories',
    'View service categories and subcategories.',
    'categories'
),

(
    'admin.categories.create',
    'Create Categories',
    'Create service categories and subcategories.',
    'categories'
),

(
    'admin.categories.update',
    'Update Categories',
    'Edit category information.',
    'categories'
),

(
    'admin.categories.manage_status',
    'Manage Category Status',
    'Activate or deactivate service categories.',
    'categories'
),


-- USER MANAGEMENT

(
    'admin.users.read',
    'View Users',
    'View customer and professional accounts.',
    'users'
),

(
    'admin.users.update',
    'Manage Users',
    'Manage permitted user account information.',
    'users'
),

(
    'admin.users.suspend',
    'Suspend Users',
    'Suspend or reactivate eligible user accounts.',
    'users'
),


-- PROFESSIONAL MANAGEMENT

(
    'admin.professionals.read',
    'View Professionals',
    'Review professional profiles and services.',
    'professionals'
),

(
    'admin.professionals.approve',
    'Approve Professionals',
    'Approve or reject professional profile applications.',
    'professionals'
),


-- BOOKING MANAGEMENT

(
    'admin.bookings.read',
    'View Bookings',
    'View platform booking records.',
    'bookings'
),

(
    'admin.bookings.manage',
    'Manage Bookings',
    'Perform permitted administrative booking operations.',
    'bookings'
),


-- PAYMENT MANAGEMENT

(
    'admin.payments.read',
    'View Payments',
    'View payment records and transaction information.',
    'payments'
),

(
    'admin.payments.refund',
    'Process Refunds',
    'Initiate authorized payment refunds.',
    'payments'
),


-- ADVERTISEMENT MANAGEMENT

(
    'admin.advertising.read',
    'View Advertisements',
    'View advertisement campaigns and packages.',
    'advertising'
),

(
    'admin.advertising.manage',
    'Manage Advertisements',
    'Manage advertisement campaigns and approvals.',
    'advertising'
),


-- CUSTOMER SUPPORT

(
    'admin.support.read',
    'View Support Records',
    'Review customer support requests and complaints.',
    'support'
),

(
    'admin.support.manage',
    'Manage Support Records',
    'Manage support cases and authorized dispute workflows.',
    'support'
),


-- CONTENT MANAGEMENT

(
    'admin.content.read',
    'View Platform Content',
    'View homepage content and announcements.',
    'content'
),

(
    'admin.content.manage',
    'Manage Platform Content',
    'Manage approved platform content and announcements.',
    'content'
)

ON CONFLICT (permission_key)
DO NOTHING;


-- =====================================================
-- 6. COMMENTS
-- =====================================================

COMMENT ON TABLE admin_permissions IS
  'Catalogue of granular SKILVIA administrator permissions.';

COMMENT ON TABLE admin_user_permissions IS
  'Individual permissions assigned to administrator accounts.';

COMMENT ON COLUMN admin_user_permissions.expires_at IS
  'Optional expiration time for a granted administrator permission.';


COMMIT;

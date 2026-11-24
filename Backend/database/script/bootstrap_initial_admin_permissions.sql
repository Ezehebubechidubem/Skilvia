
BEGIN;

DO $$
DECLARE
  target_admin_id UUID;
  admin_email TEXT := 'ezehebubechidubem@gmail.com';
BEGIN
  -- Find exactly one active administrator.
  SELECT id
  INTO target_admin_id
  FROM users
  WHERE
    LOWER(email) = LOWER(admin_email)
    AND role = 'admin'
    AND account_status = 'active';

  IF target_admin_id IS NULL THEN
    RAISE EXCEPTION
      'No active administrator found for the supplied email.';
  END IF;

  -- Grant permission-management access to the initial administrator.
  INSERT INTO admin_user_permissions (
    admin_user_id,
    permission_id,
    granted_by,
    expires_at
  )
  SELECT
    target_admin_id,
    ap.id,
    target_admin_id,
    NULL
  FROM admin_permissions ap
  WHERE ap.permission_key IN (
    'admin.permissions.read',
    'admin.permissions.manage'
  )
    AND ap.is_active = TRUE
  ON CONFLICT (admin_user_id, permission_id)
  DO UPDATE SET
    granted_by = EXCLUDED.granted_by,
    granted_at = NOW(),
    expires_at = NULL;

  IF (
    SELECT COUNT(*)
    FROM admin_user_permissions aup
    INNER JOIN admin_permissions ap
      ON ap.id = aup.permission_id
    WHERE
      aup.admin_user_id = target_admin_id
      AND ap.permission_key IN (
        'admin.permissions.read',
        'admin.permissions.manage'
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'Initial administrator permissions were not assigned correctly.';
  END IF;
END $$;

COMMIT;

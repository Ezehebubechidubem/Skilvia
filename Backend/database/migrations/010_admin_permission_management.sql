
BEGIN;

INSERT INTO admin_permissions (
  permission_key,
  permission_name,
  description,
  permission_category,
  is_active
)
VALUES
(
  'admin.permissions.read',
  'View Admin Permissions',
  'Allows an administrator to view permission assignments and the available permission catalogue.',
  'permissions',
  TRUE
),
(
  'admin.permissions.manage',
  'Manage Admin Permissions',
  'Allows an administrator to grant, update, and revoke permissions assigned to other administrators.',
  'permissions',
  TRUE
)
ON CONFLICT (permission_key)
DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description = EXCLUDED.description,
  permission_category = EXCLUDED.permission_category,
  is_active = TRUE;

COMMIT;

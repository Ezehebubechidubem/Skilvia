
const { pool } = require("../config/database");

/**
 * Require an authenticated, active administrator with a specific
 * permission that has not expired.
 *
 * Usage:
 * router.get("/", authenticate, requireAdminPermission("admin.settings.read"), handler);
 */
const requireAdminPermission = (permissionKey) => {
  if (
    typeof permissionKey !== "string" ||
    !/^admin\.[a-z0-9_.]+$/.test(permissionKey)
  ) {
    throw new Error("A valid admin permission key is required.");
  }

  return async (req, res, next) => {
    try {
      const adminUserId = req.auth?.userId;

      if (!adminUserId) {
        return res.status(401).json({
          success: false,
          message: "Authentication is required."
        });
      }

      const result = await pool.query(
        `
          SELECT
            u.id,
            u.role,
            u.account_status,
            ap.permission_key
          FROM users u
          INNER JOIN admin_user_permissions aup
            ON aup.admin_user_id = u.id
          INNER JOIN admin_permissions ap
            ON ap.id = aup.permission_id
          WHERE
            u.id = $1
            AND u.role = 'admin'
            AND u.account_status = 'active'
            AND ap.permission_key = $2
            AND ap.is_active = TRUE
            AND (
              aup.expires_at IS NULL
              OR aup.expires_at > NOW()
            )
          LIMIT 1
        `,
        [adminUserId, permissionKey]
      );

      if (result.rowCount === 0) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action."
        });
      }

      req.adminPermission = permissionKey;

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = requireAdminPermission;

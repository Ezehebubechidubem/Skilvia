
const { pool } = require("../config/database");

const requireAdminPermission = (permissionKey) => {
  if (
    typeof permissionKey !== "string" ||
    !/^admin\.[a-z0-9_.]+$/.test(permissionKey)
  ) {
    throw new Error("Invalid administrator permission key.");
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

      // ============================================
      // 1. VERIFY ADMIN ACCOUNT
      // ============================================

      const adminResult = await pool.query(
        `
          SELECT
            id,
            role,
            account_status,
            admin_type
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [adminUserId]
      );

      if (adminResult.rowCount === 0) {
        return res.status(403).json({
          success: false,
          message: "Administrator access is required."
        });
      }

      const admin = adminResult.rows[0];

      if (
        admin.role !== "admin" ||
        admin.account_status !== "active"
      ) {
        return res.status(403).json({
          success: false,
          message: "Your administrator account is not authorized."
        });
      }

      // ============================================
      // 2. SUPER ADMIN HAS FULL ADMIN ACCESS
      // ============================================

      if (admin.admin_type === "super_admin") {
        req.adminPermission = permissionKey;
        req.adminType = "super_admin";

        return next();
      }

      // ============================================
      // 3. SUB-ADMIN MUST HAVE THE PERMISSION
      // ============================================

      if (admin.admin_type !== "sub_admin") {
        return res.status(403).json({
          success: false,
          message: "Your administrator designation is invalid."
        });
      }

      const permissionResult = await pool.query(
        `
          SELECT 1
          FROM admin_user_permissions aup
          INNER JOIN admin_permissions ap
            ON ap.id = aup.permission_id
          WHERE aup.admin_user_id = $1
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

      if (permissionResult.rowCount === 0) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action."
        });
      }

      req.adminPermission = permissionKey;
      req.adminType = "sub_admin";

      return next();

    } catch (error) {
      return next(error);
    }
  };
};

module.exports = requireAdminPermission;

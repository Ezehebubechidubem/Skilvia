
const { pool } = require("../config/database");

const requireSuperAdmin = async (req, res, next) => {
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
        SELECT id
        FROM users
        WHERE id = $1
          AND role = 'admin'
          AND admin_type = 'super_admin'
          AND account_status = 'active'
        LIMIT 1
      `,
      [adminUserId]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "Only the active main administrator can perform this action."
      });
    }

    req.adminType = "super_admin";

    return next();

  } catch (error) {
    return next(error);
  }
};

module.exports = requireSuperAdmin;

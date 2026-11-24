
const { pool } = require("../config/database");


// =====================================================
// GET ADMIN AUDIT LOGS
// =====================================================

const getAdminAuditLogs = async (req, res, next) => {
  try {
    const filters = req.validated.query;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    const addFilter = (column, value) => {
      if (value !== undefined) {
        values.push(value);
        conditions.push(
          `${column} = $${values.length}`
        );
      }
    };

    addFilter(
      "aal.actor_user_id",
      filters.actor_user_id
    );

    addFilter(
      "aal.action",
      filters.action
    );

    addFilter(
      "aal.entity_type",
      filters.entity_type
    );

    addFilter(
      "aal.entity_id",
      filters.entity_id
    );

    if (filters.start_date) {
      values.push(filters.start_date);

      conditions.push(
        `aal.created_at >= $${values.length}::timestamptz`
      );
    }

    if (filters.end_date) {
      values.push(filters.end_date);

      conditions.push(
        `aal.created_at <= $${values.length}::timestamptz`
      );
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM admin_audit_logs aal
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];

    const result = await pool.query(
      `SELECT
        aal.id,
        aal.actor_user_id,
        u.full_name AS administrator_name,
        u.email AS administrator_email,
        aal.action,
        aal.entity_type,
        aal.entity_id,
        aal.before_data,
        aal.after_data,
        aal.ip_address,
        aal.user_agent,
        aal.request_id,
        aal.created_at
       FROM admin_audit_logs aal
       LEFT JOIN users u
         ON u.id = aal.actor_user_id
       ${whereClause}
       ORDER BY aal.created_at DESC, aal.id DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      dataValues
    );

    return res.status(200).json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: offset + result.rowCount < total,
        hasPreviousPage: page > 1
      },
      auditLogs: result.rows
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// GET ONE AUDIT RECORD
// =====================================================

const getAdminAuditLog = async (req, res, next) => {
  try {
    const { auditLogId } = req.validated.params;

    const result = await pool.query(
      `SELECT
        aal.id,
        aal.actor_user_id,
        u.full_name AS administrator_name,
        u.email AS administrator_email,
        aal.action,
        aal.entity_type,
        aal.entity_id,
        aal.before_data,
        aal.after_data,
        aal.ip_address,
        aal.user_agent,
        aal.request_id,
        aal.created_at
       FROM admin_audit_logs aal
       LEFT JOIN users u
         ON u.id = aal.actor_user_id
       WHERE aal.id = $1
       LIMIT 1`,
      [auditLogId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Audit record not found."
      });
    }

    return res.status(200).json({
      success: true,
      auditLog: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  getAdminAuditLogs,
  getAdminAuditLog
};

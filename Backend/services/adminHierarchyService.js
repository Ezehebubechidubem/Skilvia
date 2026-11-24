
const bcrypt = require("bcrypt");

const { pool } = require("../config/database");
const { recordAdminAudit } = require("./adminAuditService");

class AdminHierarchyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AdminHierarchyError";
    this.statusCode = statusCode;
  }
}

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const validateSuperAdmin = async (client, actorUserId) => {
  const result = await client.query(
    `
      SELECT id
      FROM users
      WHERE id = $1
        AND role = 'admin'
        AND admin_type = 'super_admin'
        AND account_status = 'active'
      FOR UPDATE
    `,
    [actorUserId]
  );

  if (result.rowCount === 0) {
    throw new AdminHierarchyError(
      "Only the active super administrator can manage administrators.",
      403
    );
  }
};

const auditAction = async (
  client,
  actorUserId,
  action,
  entityId,
  beforeData,
  afterData,
  metadata = {}
) => {
  await recordAdminAudit({
    actorUserId,
    action,
    entityType: "administrator",
    entityId,
    beforeData,
    afterData,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    requestId: metadata.requestId
  }, client);
};

const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }

    throw error;
  } finally {
    client.release();
  }
};


// =====================================================
// LIST ADMINISTRATORS
// =====================================================

const listAdministrators = async ({
  page = 1,
  limit = 30,
  search,
  admin_type,
  account_status
} = {}) => {
  const conditions = ["role = 'admin'"];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(full_name ILIKE $${values.length}
        OR email ILIKE $${values.length}
        OR phone ILIKE $${values.length})`
    );
  }

  if (admin_type) {
    values.push(admin_type);
    conditions.push(`admin_type = $${values.length}`);
  }

  if (account_status) {
    values.push(account_status);
    conditions.push(`account_status = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::INTEGER AS total
      FROM users
      WHERE ${whereClause}
    `,
    values
  );

  const dataValues = [...values, limit, offset];

  const result = await pool.query(
    `
      SELECT
        id,
        full_name,
        email,
        phone,
        admin_type,
        account_status,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN admin_type = 'super_admin' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    dataValues
  );

  return {
    administrators: result.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(
        countResult.rows[0].total / limit
      )
    }
  };
};


// =====================================================
// GET ADMINISTRATOR DETAILS
// =====================================================

const getAdministrator = async (adminId) => {
  const result = await pool.query(
    `
      SELECT
        id,
        full_name,
        email,
        phone,
        admin_type,
        account_status,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE id = $1
        AND role = 'admin'
      LIMIT 1
    `,
    [adminId]
  );

  if (result.rowCount === 0) {
    throw new AdminHierarchyError(
      "Administrator account not found.",
      404
    );
  }

  return result.rows[0];
};


// =====================================================
// CREATE SUB-ADMINISTRATOR
// =====================================================

const createSubAdmin = async (
  data,
  actorUserId,
  metadata = {}
) => {
  if (
    !Number.isInteger(SALT_ROUNDS) ||
    SALT_ROUNDS < 10 ||
    SALT_ROUNDS > 15
  ) {
    throw new AdminHierarchyError(
      "Invalid password hashing configuration.",
      500
    );
  }

  const passwordHash = await bcrypt.hash(
    data.password,
    SALT_ROUNDS
  );

  return withTransaction(async (client) => {
    await validateSuperAdmin(client, actorUserId);

    const existingUser = await client.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR phone = $2
        LIMIT 1
      `,
      [data.email, data.phone]
    );

    if (existingUser.rowCount > 0) {
      throw new AdminHierarchyError(
        "An account with this email or phone number already exists.",
        409
      );
    }

    const result = await client.query(
      `
        INSERT INTO users (
          full_name,
          email,
          phone,
          password_hash,
          role,
          admin_type,
          account_status
        )
        VALUES ($1, $2, $3, $4, 'admin', 'sub_admin', 'active')
        RETURNING
          id,
          full_name,
          email,
          phone,
          admin_type,
          account_status,
          created_at
      `,
      [
        data.full_name,
        data.email,
        data.phone,
        passwordHash
      ]
    );

    const administrator = result.rows[0];

    await auditAction(
      client,
      actorUserId,
      "admin.sub_admin.created",
      administrator.id,
      null,
      administrator,
      metadata
    );

    return administrator;
  });
};


// =====================================================
// UPDATE SUB-ADMINISTRATOR STATUS
// =====================================================

const updateSubAdminStatus = async (
  adminId,
  accountStatus,
  actorUserId,
  metadata = {}
) => {
  return withTransaction(async (client) => {
    await validateSuperAdmin(client, actorUserId);

    const existingResult = await client.query(
      `
        SELECT
          id,
          full_name,
          email,
          admin_type,
          account_status
        FROM users
        WHERE id = $1
          AND role = 'admin'
        FOR UPDATE
      `,
      [adminId]
    );

    if (existingResult.rowCount === 0) {
      throw new AdminHierarchyError(
        "Administrator account not found.",
        404
      );
    }

    const existingAdmin = existingResult.rows[0];

    if (existingAdmin.admin_type === "super_admin") {
      throw new AdminHierarchyError(
        "The main administrator cannot be modified through sub-admin management.",
        403
      );
    }

    if (existingAdmin.account_status === accountStatus) {
      throw new AdminHierarchyError(
        "The administrator already has this account status.",
        409
      );
    }

    const result = await client.query(
      `
        UPDATE users
        SET
          account_status = $1,
          updated_at = NOW()
        WHERE id = $2
          AND role = 'admin'
          AND admin_type = 'sub_admin'
        RETURNING
          id,
          full_name,
          email,
          admin_type,
          account_status,
          updated_at
      `,
      [accountStatus, adminId]
    );

    const updatedAdmin = result.rows[0];

    await auditAction(
      client,
      actorUserId,
      "admin.sub_admin.status_updated",
      adminId,
      existingAdmin,
      updatedAdmin,
      metadata
    );

    return updatedAdmin;
  });
};


module.exports = {
  AdminHierarchyError,
  listAdministrators,
  getAdministrator,
  createSubAdmin,
  updateSubAdminStatus
};

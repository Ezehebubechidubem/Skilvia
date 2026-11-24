
const { pool } = require("../config/database");
const { recordAdminAudit } = require("./adminAuditService");

class AdminPermissionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AdminPermissionError";
    this.statusCode = statusCode;
  }
}

const validateAdmin = async (client, adminId) => {
  const result = await client.query(
    `
      SELECT id, email, full_name
      FROM users
      WHERE
        id = $1
        AND role = 'admin'
        AND account_status = 'active'
      FOR UPDATE
    `,
    [adminId]
  );

  if (result.rowCount === 0) {
    throw new AdminPermissionError(
      "The selected administrator does not exist or is inactive.",
      404
    );
  }

  return result.rows[0];
};

const validatePermission = async (client, permissionKey) => {
  const result = await client.query(
    `
      SELECT id, permission_key, permission_name, permission_category
      FROM admin_permissions
      WHERE permission_key = $1
        AND is_active = TRUE
      FOR SHARE
    `,
    [permissionKey]
  );

  if (result.rowCount === 0) {
    throw new AdminPermissionError(
      "The requested permission does not exist or is inactive.",
      404
    );
  }

  return result.rows[0];
};

const validateExpiry = (expiresAt) => {
  if (expiresAt === undefined || expiresAt === null) {
    return null;
  }

  const parsedDate = new Date(expiresAt);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminPermissionError("Invalid permission expiry date.");
  }

  if (parsedDate.getTime() <= Date.now()) {
    throw new AdminPermissionError(
      "Permission expiry must be a future date."
    );
  }

  return parsedDate;
};

const auditPermissionChange = async (
  client,
  {
    actorUserId,
    action,
    adminId,
    permissionKey,
    beforeData,
    afterData,
    requestMetadata = {}
  }
) => {
  await recordAdminAudit(
    {
      actorUserId,
      action,
      entityType: "admin_permission_assignment",
      entityId: `${adminId}:${permissionKey}`,
      beforeData,
      afterData,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      requestId: requestMetadata.requestId
    },
    client
  );
};

const listPermissionCatalogue = async ({
  category,
  activeOnly = true,
  page = 1,
  limit = 30
} = {}) => {
  const values = [];
  const conditions = [];

  if (category) {
    values.push(category);
    conditions.push(`permission_category = $${values.length}`);
  }

  if (activeOnly) {
    conditions.push("is_active = TRUE");
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM admin_permissions
      ${whereClause}
    `,
    values
  );

  const offset = (page - 1) * limit;

  const result = await pool.query(
    `
      SELECT
        id,
        permission_key,
        permission_name,
        description,
        permission_category,
        is_active,
        created_at
      FROM admin_permissions
      ${whereClause}
      ORDER BY permission_category ASC, permission_key ASC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return {
    permissions: result.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    }
  };
};

const listAdministrators = async ({
  search,
  page = 1,
  limit = 30
} = {}) => {
  const values = [];
  let whereClause = `
    WHERE role = 'admin'
  `;

  if (search) {
    values.push(`%${search}%`);
    whereClause += `
      AND (
        full_name ILIKE $1
        OR email ILIKE $1
      )
    `;
  }

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM users
      ${whereClause}
    `,
    values
  );

  const offset = (page - 1) * limit;

  const result = await pool.query(
    `
      SELECT
        id,
        full_name,
        email,
        account_status,
        created_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return {
    administrators: result.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    }
  };
};

const getAdminPermissionAssignments = async (adminId) => {
  const adminResult = await pool.query(
    `
      SELECT id, full_name, email, account_status
      FROM users
      WHERE id = $1 AND role = 'admin'
      LIMIT 1
    `,
    [adminId]
  );

  if (adminResult.rowCount === 0) {
    throw new AdminPermissionError(
      "Administrator account not found.",
      404
    );
  }

  const assignmentsResult = await pool.query(
    `
      SELECT
        ap.permission_key,
        ap.permission_name,
        ap.description,
        ap.permission_category,
        ap.is_active AS permission_is_active,
        aup.granted_at,
        aup.expires_at,
        grantor.id AS granted_by_id,
        grantor.full_name AS granted_by_name,
        CASE
          WHEN ap.is_active = FALSE THEN FALSE
          WHEN aup.expires_at IS NOT NULL
            AND aup.expires_at <= NOW() THEN FALSE
          ELSE TRUE
        END AS is_effective
      FROM admin_user_permissions aup
      INNER JOIN admin_permissions ap
        ON ap.id = aup.permission_id
      LEFT JOIN users grantor
        ON grantor.id = aup.granted_by
      WHERE aup.admin_user_id = $1
      ORDER BY ap.permission_category, ap.permission_key
    `,
    [adminId]
  );

  return {
    administrator: adminResult.rows[0],
    assignments: assignmentsResult.rows
  };
};

const grantAdminPermission = async ({
  actorUserId,
  adminId,
  permissionKey,
  expiresAt,
  requestMetadata
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await validateAdmin(client, adminId);

    const permission = await validatePermission(
      client,
      permissionKey
    );

    const expiry = validateExpiry(expiresAt);

    const existingResult = await client.query(
      `
        SELECT
          admin_user_id,
          permission_id,
          granted_by,
          granted_at,
          expires_at
        FROM admin_user_permissions
        WHERE
          admin_user_id = $1
          AND permission_id = $2
        FOR UPDATE
      `,
      [adminId, permission.id]
    );

    let assignment;
    let action;
    let beforeData = null;

    if (existingResult.rowCount > 0) {
      const existing = existingResult.rows[0];

      beforeData = {
        permissionKey,
        grantedBy: existing.granted_by,
        grantedAt: existing.granted_at,
        expiresAt: existing.expires_at
      };

      const updateResult = await client.query(
        `
          UPDATE admin_user_permissions
          SET
            granted_by = $3,
            granted_at = NOW(),
            expires_at = $4
          WHERE
            admin_user_id = $1
            AND permission_id = $2
          RETURNING granted_at, expires_at
        `,
        [adminId, permission.id, actorUserId, expiry]
      );

      assignment = updateResult.rows[0];
      action = "admin.permission.reactivated_or_updated";
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO admin_user_permissions (
            admin_user_id,
            permission_id,
            granted_by,
            expires_at
          )
          VALUES ($1, $2, $3, $4)
          RETURNING granted_at, expires_at
        `,
        [adminId, permission.id, actorUserId, expiry]
      );

      assignment = insertResult.rows[0];
      action = "admin.permission.granted";
    }

    await auditPermissionChange(client, {
      actorUserId,
      action,
      adminId,
      permissionKey,
      beforeData,
      afterData: {
        permissionKey,
        grantedBy: actorUserId,
        grantedAt: assignment.granted_at,
        expiresAt: assignment.expires_at
      },
      requestMetadata
    });

    await client.query("COMMIT");

    return {
      adminId,
      permissionKey,
      grantedAt: assignment.granted_at,
      expiresAt: assignment.expires_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateAdminPermissionExpiry = async ({
  actorUserId,
  adminId,
  permissionKey,
  expiresAt,
  requestMetadata
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await validateAdmin(client, adminId);

    const permission = await validatePermission(
      client,
      permissionKey
    );

    const expiry = validateExpiry(expiresAt);

    const existingResult = await client.query(
      `
        SELECT granted_at, granted_by, expires_at
        FROM admin_user_permissions
        WHERE
          admin_user_id = $1
          AND permission_id = $2
        FOR UPDATE
      `,
      [adminId, permission.id]
    );

    if (existingResult.rowCount === 0) {
      throw new AdminPermissionError(
        "This administrator does not have that permission.",
        404
      );
    }

    const before = existingResult.rows[0];

    const updateResult = await client.query(
      `
        UPDATE admin_user_permissions
        SET expires_at = $3
        WHERE
          admin_user_id = $1
          AND permission_id = $2
        RETURNING granted_at, expires_at
      `,
      [adminId, permission.id, expiry]
    );

    const updated = updateResult.rows[0];

    await auditPermissionChange(client, {
      actorUserId,
      action: "admin.permission.expiry_updated",
      adminId,
      permissionKey,
      beforeData: {
        permissionKey,
        expiresAt: before.expires_at
      },
      afterData: {
        permissionKey,
        expiresAt: updated.expires_at
      },
      requestMetadata
    });

    await client.query("COMMIT");

    return {
      adminId,
      permissionKey,
      grantedAt: updated.granted_at,
      expiresAt: updated.expires_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const revokeAdminPermission = async ({
  actorUserId,
  adminId,
  permissionKey,
  requestMetadata
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await validateAdmin(client, adminId);

    const permission = await validatePermission(
      client,
      permissionKey
    );

    const existingResult = await client.query(
      `
        SELECT granted_at, granted_by, expires_at
        FROM admin_user_permissions
        WHERE
          admin_user_id = $1
          AND permission_id = $2
        FOR UPDATE
      `,
      [adminId, permission.id]
    );

    if (existingResult.rowCount === 0) {
      throw new AdminPermissionError(
        "This administrator does not have that permission.",
        404
      );
    }

    const existing = existingResult.rows[0];

    await client.query(
      `
        DELETE FROM admin_user_permissions
        WHERE
          admin_user_id = $1
          AND permission_id = $2
      `,
      [adminId, permission.id]
    );

    await auditPermissionChange(client, {
      actorUserId,
      action: "admin.permission.revoked",
      adminId,
      permissionKey,
      beforeData: {
        permissionKey,
        grantedBy: existing.granted_by,
        grantedAt: existing.granted_at,
        expiresAt: existing.expires_at
      },
      afterData: null,
      requestMetadata
    });

    await client.query("COMMIT");

    return {
      adminId,
      permissionKey,
      revoked: true
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  AdminPermissionError,
  listPermissionCatalogue,
  listAdministrators,
  getAdminPermissionAssignments,
  grantAdminPermission,
  updateAdminPermissionExpiry,
  revokeAdminPermission
};

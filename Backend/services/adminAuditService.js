
const { pool } = require("../config/database");


// =====================================================
// SENSITIVE FIELD PROTECTION
// =====================================================

const SENSITIVE_FIELDS = new Set([
  "password",
  "password_hash",
  "current_password",
  "new_password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "secret",
  "api_key",
  "private_key",
  "encryption_key",
  "webhook_hash",
  "jwt_secret",
  "database_url"
]);


// =====================================================
// SANITIZE AUDIT DATA
// =====================================================

const sanitizeAuditData = (value, depth = 0) => {
  if (depth > 10) {
    return "[MAXIMUM NESTING REACHED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeAuditData(item, depth + 1)
    );
  }

  if (typeof value === "object") {
    const sanitized = {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      sanitized[key] = sanitizeAuditData(
        item,
        depth + 1
      );
    }

    return sanitized;
  }

  return String(value);
};


// =====================================================
// VALIDATE AUDIT INPUT
// =====================================================

const validateAuditInput = (data) => {
  if (!data || typeof data !== "object") {
    throw new Error("Audit log data is required.");
  }

  const requiredFields = [
    "actorUserId",
    "action",
    "entityType"
  ];

  for (const field of requiredFields) {
    if (
      typeof data[field] !== "string" ||
      !data[field].trim()
    ) {
      throw new Error(
        `Invalid audit log field: ${field}.`
      );
    }
  }

  if (data.action.length > 100) {
    throw new Error("Audit action is too long.");
  }

  if (data.entityType.length > 100) {
    throw new Error("Audit entity type is too long.");
  }

  if (
    data.entityId !== undefined &&
    data.entityId !== null &&
    (
      typeof data.entityId !== "string" ||
      data.entityId.length > 150
    )
  ) {
    throw new Error("Invalid audit entity ID.");
  }
};


// =====================================================
// RECORD ADMIN ACTION
// =====================================================

const recordAdminAudit = async (
  data,
  databaseClient = pool
) => {
  validateAuditInput(data);

  const beforeData =
    data.beforeData === undefined
      ? null
      : sanitizeAuditData(data.beforeData);

  const afterData =
    data.afterData === undefined
      ? null
      : sanitizeAuditData(data.afterData);

  const ipAddress =
    typeof data.ipAddress === "string" &&
    data.ipAddress.trim()
      ? data.ipAddress.trim()
      : null;

  const userAgent =
    typeof data.userAgent === "string"
      ? data.userAgent.slice(0, 1000)
      : null;

  const requestId =
    typeof data.requestId === "string"
      ? data.requestId.slice(0, 150)
      : null;

  const result = await databaseClient.query(
    `INSERT INTO admin_audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      ip_address,
      user_agent,
      request_id
    )
    VALUES (
      $1, $2, $3, $4,
      $5::jsonb, $6::jsonb,
      $7::inet, $8, $9
    )
    RETURNING id, created_at`,
    [
      data.actorUserId,
      data.action.trim(),
      data.entityType.trim(),
      data.entityId || null,
      beforeData === null
        ? null
        : JSON.stringify(beforeData),
      afterData === null
        ? null
        : JSON.stringify(afterData),
      ipAddress,
      userAgent,
      requestId
    ]
  );

  return result.rows[0];
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  recordAdminAudit,
  sanitizeAuditData
};


const { pool } = require("../config/database");

const {
  recordAdminAudit
} = require("./adminAuditService");

const {
  validatePlatformSettingValue
} = require("../config/platformSettingDefinitions");


// =====================================================
// GET CURRENT EFFECTIVE SETTING
// =====================================================

const getEffectiveSetting = async (
  settingKey,
  databaseClient = pool
) => {
  const result = await databaseClient.query(
    `SELECT
      ps.setting_key,
      ps.category,
      ps.description,
      ps.is_public,
      ps.is_editable,
      psv.setting_value,
      psv.version_number,
      psv.effective_from,
      psv.effective_until
     FROM platform_settings ps
     LEFT JOIN LATERAL (
       SELECT
         setting_value,
         version_number,
         effective_from,
         effective_until
       FROM platform_setting_versions
       WHERE setting_id = ps.id
         AND effective_from <= NOW()
         AND (
           effective_until IS NULL
           OR effective_until > NOW()
         )
       ORDER BY effective_from DESC
       LIMIT 1
     ) psv ON TRUE
     WHERE ps.setting_key = $1
     LIMIT 1`,
    [settingKey]
  );

  return result.rows[0] || null;
};


// =====================================================
// GET MULTIPLE EFFECTIVE SETTINGS
// =====================================================

const getPlatformSettings = async ({
  category = null,
  publicOnly = false,
  page = 1,
  limit = 30
} = {}, databaseClient = pool) => {
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(
      `ps.category = $${values.length}`
    );
  }

  if (publicOnly) {
    conditions.push("ps.is_public = TRUE");
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countResult = await databaseClient.query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM platform_settings ps
     ${whereClause}`,
    values
  );

  const total = countResult.rows[0].total;

  const result = await databaseClient.query(
    `SELECT
      ps.setting_key,
      ps.category,
      ps.description,
      ps.is_public,
      ps.is_editable,
      psv.setting_value,
      psv.version_number,
      psv.effective_from,
      psv.effective_until
     FROM platform_settings ps
     LEFT JOIN LATERAL (
       SELECT
         setting_value,
         version_number,
         effective_from,
         effective_until
       FROM platform_setting_versions
       WHERE setting_id = ps.id
         AND effective_from <= NOW()
         AND (
           effective_until IS NULL
           OR effective_until > NOW()
         )
       ORDER BY effective_from DESC
       LIMIT 1
     ) psv ON TRUE
     ${whereClause}
     ORDER BY ps.category ASC, ps.setting_key ASC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    settings: result.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


// =====================================================
// CREATE A NEW SETTING VERSION
// =====================================================

const createSettingVersion = async ({
  settingKey,
  settingValue,
  effectiveFrom,
  adminUserId,
  ipAddress = null,
  userAgent = null,
  requestId = null
}) => {
  // Validate before opening the transaction.
  const validatedValue = validatePlatformSettingValue(
    settingKey,
    settingValue
  );

  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the setting definition to serialize changes.
    const settingResult = await client.query(
      `SELECT *
       FROM platform_settings
       WHERE setting_key = $1
       FOR UPDATE`,
      [settingKey]
    );

    if (settingResult.rowCount === 0) {
      const error = new Error(
        "Platform setting was not found."
      );

      error.statusCode = 404;
      throw error;
    }

    const setting = settingResult.rows[0];

    if (!setting.is_editable) {
      const error = new Error(
        "This platform setting cannot be edited."
      );

      error.statusCode = 403;
      throw error;
    }

    // The database clock is authoritative for scheduling.
    const clockResult = await client.query(
      "SELECT NOW() AS database_time"
    );

    const databaseNow = new Date(
      clockResult.rows[0].database_time
    );

    const startDate = effectiveFrom
      ? new Date(effectiveFrom)
      : databaseNow;

    if (
      Number.isNaN(startDate.getTime()) ||
      startDate.getTime() < databaseNow.getTime()
    ) {
      const error = new Error(
        "The effective date cannot be in the past."
      );

      error.statusCode = 400;
      throw error;
    }

    // Lock and retrieve the latest version.
    const latestResult = await client.query(
      `SELECT *
       FROM platform_setting_versions
       WHERE setting_id = $1
       ORDER BY effective_from DESC
       LIMIT 1
       FOR UPDATE`,
      [setting.id]
    );

    const latestVersion = latestResult.rows[0] || null;

    if (
      latestVersion &&
      startDate.getTime() <=
        new Date(latestVersion.effective_from).getTime()
    ) {
      const error = new Error(
        "The new version must start after the latest scheduled version."
      );

      error.statusCode = 409;
      throw error;
    }

    if (
      latestVersion &&
      latestVersion.effective_until !== null
    ) {
      const error = new Error(
        "The latest setting version already has an end date. Review its version history before adding another version."
      );

      error.statusCode = 409;
      throw error;
    }

    const nextVersionNumber = latestVersion
      ? latestVersion.version_number + 1
      : 1;

    // Close the previous version exactly when the new one begins.
    if (latestVersion) {
      await client.query(
        `UPDATE platform_setting_versions
         SET effective_until = $1
         WHERE id = $2`,
        [
          startDate.toISOString(),
          latestVersion.id
        ]
      );
    }

    const insertResult = await client.query(
      `INSERT INTO platform_setting_versions (
        setting_id,
        setting_value,
        version_number,
        effective_from,
        created_by
      )
      VALUES ($1, $2::jsonb, $3, $4, $5)
      RETURNING *`,
      [
        setting.id,
        JSON.stringify(validatedValue),
        nextVersionNumber,
        startDate.toISOString(),
        adminUserId
      ]
    );

    const newVersion = insertResult.rows[0];

    // Audit is part of the same transaction.
    await recordAdminAudit(
      {
        actorUserId: adminUserId,
        action: "platform_setting_version_created",
        entityType: "platform_setting",
        entityId: setting.id,

        beforeData: latestVersion
          ? {
              version_number:
                latestVersion.version_number,
              setting_value:
                latestVersion.setting_value,
              effective_from:
                latestVersion.effective_from,
              effective_until:
                latestVersion.effective_until
            }
          : null,

        afterData: {
          setting_key: setting.setting_key,
          version_number: newVersion.version_number,
          setting_value: newVersion.setting_value,
          effective_from: newVersion.effective_from,
          effective_until: newVersion.effective_until
        },

        ipAddress,
        userAgent,
        requestId
      },
      client
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return {
      settingKey: setting.setting_key,
      version: newVersion
    };

  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Platform setting rollback failed:",
          rollbackError.message
        );
      }
    }

    throw error;

  } finally {
    client.release();
  }
};


// =====================================================
// GET SETTING VERSION HISTORY
// =====================================================

const getSettingHistory = async ({
  settingKey,
  page = 1,
  limit = 20
}) => {
  const offset = (page - 1) * limit;

  const settingResult = await pool.query(
    `SELECT
      id,
      setting_key,
      category,
      description,
      is_public,
      is_editable
     FROM platform_settings
     WHERE setting_key = $1
     LIMIT 1`,
    [settingKey]
  );

  if (settingResult.rowCount === 0) {
    return null;
  }

  const setting = settingResult.rows[0];

  const countResult = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM platform_setting_versions
     WHERE setting_id = $1`,
    [setting.id]
  );

  const total = countResult.rows[0].total;

  const result = await pool.query(
    `SELECT
      psv.id,
      psv.setting_value,
      psv.version_number,
      psv.effective_from,
      psv.effective_until,
      psv.created_by,
      u.full_name AS administrator_name,
      psv.created_at
     FROM platform_setting_versions psv
     LEFT JOIN users u
       ON u.id = psv.created_by
     WHERE psv.setting_id = $1
     ORDER BY psv.version_number DESC
     LIMIT $2
     OFFSET $3`,
    [setting.id, limit, offset]
  );

  return {
    setting,
    versions: result.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  getEffectiveSetting,
  getPlatformSettings,
  createSettingVersion,
  getSettingHistory
};

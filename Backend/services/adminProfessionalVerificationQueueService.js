
const { pool } = require("../config/database");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const logQueueError = (error, adminId, page, limit) => {
  const stackFrames = typeof error.stack === "string"
    ? error.stack.split("\n").slice(1, 8)
    : [];

  console.error(JSON.stringify({
    event: "admin_professional_verification_queue_failed",
    timestamp: new Date().toISOString(),
    operation: "list_pending_verifications",
    admin_id: adminId,
    page,
    limit,
    error_name: error.name || "Error",
    error_code: error.code || null,
    database_constraint: error.constraint || null,
    stack_frames: stackFrames
  }));
};

const getPendingProfessionalVerifications = async ({
  adminId,
  page = 1,
  limit = 30
}) => {
  if (
    typeof adminId !== "string" ||
    !adminId.trim()
  ) {
    throw new ProfessionalVerificationError(
      "Authenticated administrator information is required.",
      401
    );
  }

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000
  ) {
    throw new ProfessionalVerificationError(
      "Invalid page number.",
      400
    );
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new ProfessionalVerificationError(
      "Page limit must be between 1 and 100.",
      400
    );
  }

  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    throw new ProfessionalVerificationError(
      "Invalid pagination offset.",
      400
    );
  }

  let client;

  try {
    client = await pool.connect();

    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );

    const countResult = await client.query(
      `
        SELECT COUNT(*)::INTEGER AS total
        FROM professional_verification_applications
        WHERE status = 'pending'
      `
    );

    const applicationsResult = await client.query(
      `
        SELECT
          pva.id AS application_id,
          pva.professional_profile_id,
          pva.submitted_by,
          pva.status,
          pva.legal_full_name,
          pva.date_of_birth,
          pva.country,
          pva.state,
          pva.city,
          pva.submitted_at,
          pva.updated_at,

          COALESCE(
            (
              SELECT COUNT(*)::INTEGER
              FROM professional_verification_documents pvd
              WHERE pvd.application_id = pva.id
            ),
            0
          ) AS document_count,

          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'document_id', pvd.id,
                  'document_type', pvd.document_type,
                  'file_format', pvd.file_format,
                  'file_size_bytes', pvd.file_size_bytes,
                  'uploaded_at', pvd.uploaded_at
                )
                ORDER BY pvd.uploaded_at ASC
              )
              FROM professional_verification_documents pvd
              WHERE pvd.application_id = pva.id
            ),
            '[]'::JSON
          ) AS documents

        FROM professional_verification_applications pva
        WHERE pva.status = 'pending'
        ORDER BY
          pva.submitted_at ASC NULLS LAST,
          pva.updated_at ASC,
          pva.id ASC
        LIMIT $1
        OFFSET $2
      `,
      [limit, offset]
    );

    const total = Number(countResult.rows[0].total);

    await client.query("COMMIT");

    console.info(JSON.stringify({
      event: "admin_professional_verification_queue_loaded",
      timestamp: new Date().toISOString(),
      operation: "list_pending_verifications",
      admin_id: adminId,
      page,
      limit,
      result_count: applicationsResult.rowCount,
      total_pending: total
    }));

    return {
      applications: applicationsResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next_page: page * limit < total,
        has_previous_page: page > 1
      }
    };
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    if (!(error instanceof ProfessionalVerificationError)) {
      logQueueError(error, adminId, page, limit);
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = {
  getPendingProfessionalVerifications
};

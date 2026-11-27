const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const {
  recordAdminAudit
} = require("./adminAuditService");

const DOCUMENT_URL_DURATION_SECONDS = 5 * 60;

const createDocumentAccessError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

const logDocumentAccessError = (error, context = {}) => {
  console.error(JSON.stringify({
    event: "admin_professional_verification_document_access_failed",
    timestamp: new Date().toISOString(),
    admin_id: context.adminId || null,
    application_id: context.applicationId || null,
    document_id: context.documentId || null,
    error_name: error?.name || "Error",
    error_code: error?.code || null,
    database_constraint: error?.constraint || null
  }));
};

const getAdminVerificationDocumentUrl = async ({
  adminId,
  applicationId,
  documentId,
  ipAddress = null,
  userAgent = null,
  requestId = null
}) => {
  if (!adminId || typeof adminId !== "string") {
    throw createDocumentAccessError(
      "A valid administrator account is required.",
      401
    );
  }

  if (!applicationId || typeof applicationId !== "string") {
    throw createDocumentAccessError(
      "A valid verification application is required."
    );
  }

  if (!documentId || typeof documentId !== "string") {
    throw createDocumentAccessError(
      "A valid verification document is required."
    );
  }

  let document;

  try {
    const result = await pool.query(
      `
        SELECT
          d.id AS document_id,
          d.document_type,
          d.cloudinary_public_id,
          d.cloudinary_resource_type,
          d.file_format,
          d.file_size_bytes,
          a.application_id,
          a.status AS application_status
        FROM professional_verification_documents d
        INNER JOIN professional_verification_applications a
          ON a.application_id = d.application_id
        WHERE
          d.id = $1
          AND a.application_id = $2
        LIMIT 1
      `,
      [documentId, applicationId]
    );

    document = result.rows[0] || null;
  } catch (error) {
    logDocumentAccessError(error, {
      adminId,
      applicationId,
      documentId
    });

    throw createDocumentAccessError(
      "Unable to retrieve the verification document.",
      500
    );
  }

  if (!document) {
    throw createDocumentAccessError(
      "Verification document not found.",
      404
    );
  }

  if (document.application_status !== "pending") {
    throw createDocumentAccessError(
      "Documents can only be accessed while the application is pending review.",
      409
    );
  }

  if (
    !document.cloudinary_public_id ||
    !["image", "raw"].includes(document.cloudinary_resource_type) ||
    !["jpg", "jpeg", "png", "webp", "pdf"].includes(
      String(document.file_format || "").toLowerCase()
    )
  ) {
    console.error(JSON.stringify({
      event: "admin_professional_verification_document_metadata_invalid",
      timestamp: new Date().toISOString(),
      admin_id: adminId,
      application_id: applicationId,
      document_id: documentId
    }));

    throw createDocumentAccessError(
      "The verification document is unavailable.",
      500
    );
  }

  let url;
  let expiresAt;

  try {
    assertCloudinaryConfigured();

    expiresAt =
      Math.floor(Date.now() / 1000) +
      DOCUMENT_URL_DURATION_SECONDS;

    url = cloudinary.utils.private_download_url(
      document.cloudinary_public_id,
      document.file_format,
      {
        resource_type: document.cloudinary_resource_type,
        type: "authenticated",
        expires_at: expiresAt,
        attachment: false
      }
    );

    if (
      typeof url !== "string" ||
      !url.startsWith("https://")
    ) {
      throw new Error("Invalid secure document URL.");
    }
  } catch (error) {
    logDocumentAccessError(error, {
      adminId,
      applicationId,
      documentId
    });

    throw createDocumentAccessError(
      "Unable to generate secure access to this verification document.",
      500
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await recordAdminAudit(
      {
        actorUserId: adminId,
        action: "professional_verification.document_accessed",
        entityType: "professional_verification_document",
        entityId: documentId,
        beforeData: null,
        afterData: {
          application_id: applicationId,
          document_type: document.document_type,
          file_format: document.file_format,
          access_expires_at: new Date(
            expiresAt * 1000
          ).toISOString()
        },
        ipAddress,
        userAgent,
        requestId
      },
      client
    );

    await client.query("COMMIT");

    console.info(JSON.stringify({
      event: "admin_professional_verification_document_access_granted",
      timestamp: new Date().toISOString(),
      admin_id: adminId,
      application_id: applicationId,
      document_id: documentId,
      expires_at: expiresAt
    }));

    return {
      document: {
        document_id: document.document_id,
        document_type: document.document_type,
        file_format: document.file_format,
        file_size_bytes: document.file_size_bytes
      },
      access: {
        url,
        expires_at: new Date(
          expiresAt * 1000
        ).toISOString(),
        expires_in_seconds: DOCUMENT_URL_DURATION_SECONDS
      }
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(JSON.stringify({
        event: "admin_professional_verification_document_audit_rollback_failed",
        timestamp: new Date().toISOString(),
        admin_id: adminId,
        application_id: applicationId,
        document_id: documentId,
        error_name: rollbackError?.name || "Error",
        error_code: rollbackError?.code || null
      }));
    }

    logDocumentAccessError(error, {
      adminId,
      applicationId,
      documentId
    });

    throw createDocumentAccessError(
      "Unable to record document access. The document URL has not been released.",
      500
    );
  } finally {
    client.release();
  }
};

module.exports = {
  getAdminVerificationDocumentUrl,
  DOCUMENT_URL_DURATION_SECONDS
};
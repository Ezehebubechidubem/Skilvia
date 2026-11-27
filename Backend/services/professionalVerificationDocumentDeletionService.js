const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const SERVICE_NAME = "professionalVerificationDocumentDeletionService";

const createDeletionError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

const logDeletionEvent = (event, details = {}) => {
  console.info(
    JSON.stringify({
      event,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const logDeletionError = (event, error, details = {}) => {
  console.error(
    JSON.stringify({
      event,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      error_name: error?.name || "Error",
      error_code: error?.code || null,
      status_code: error?.statusCode || null,
      ...details
    })
  );
};

const rollbackSafely = async (client, details = {}) => {
  try {
    await client.query("ROLLBACK");

    logDeletionEvent(
      "professional_verification_document_deletion_rollback_succeeded",
      details
    );
  } catch (rollbackError) {
    logDeletionError(
      "professional_verification_document_deletion_rollback_failed",
      rollbackError,
      details
    );
  }
};

const deleteProfessionalVerificationDocument = async (
  userId,
  applicationId,
  documentId
) => {
  assertCloudinaryConfigured();

  const client = await pool.connect();

  let transactionStarted = false;

  const logContext = {
    user_id: userId,
    application_id: applicationId,
    document_id: documentId
  };

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the professional profile first.
    // This serializes deletion against application submission.
    const profileResult = await client.query(
      `
        SELECT
          pp.id AS professional_profile_id,
          pp.verification_status,
          u.role,
          u.account_status
        FROM professional_profiles pp
        INNER JOIN users u
          ON u.id = pp.user_id
        WHERE u.id = $1
        FOR UPDATE OF pp
      `,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      throw createDeletionError(
        "Professional profile not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    if (profile.role !== "professional") {
      throw createDeletionError(
        "Only professional accounts can delete verification documents.",
        403
      );
    }

    if (profile.account_status !== "active") {
      throw createDeletionError(
        "Your account is not active.",
        403
      );
    }

    if (profile.verification_status === "approved") {
      throw createDeletionError(
        "Your verification is permanently approved. Your identification documents cannot be changed.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw createDeletionError(
        "Your verification is under review. Documents are locked.",
        409
      );
    }

    // Confirm application ownership and lock the application.
    const applicationResult = await client.query(
      `
        SELECT
          id,
          status
        FROM professional_verification_applications
        WHERE id = $1
          AND professional_profile_id = $2
        FOR UPDATE
      `,
      [
        applicationId,
        profile.professional_profile_id
      ]
    );

    if (applicationResult.rows.length === 0) {
      throw createDeletionError(
        "Verification application not found.",
        404
      );
    }

    if (applicationResult.rows[0].status !== "draft") {
      throw createDeletionError(
        "Documents can only be deleted from a draft application.",
        409
      );
    }

    // Retrieve and lock only the document belonging to this application.
    const documentResult = await client.query(
      `
        SELECT
          id,
          cloudinary_public_id,
          cloudinary_resource_type
        FROM professional_verification_documents
        WHERE id = $1
          AND application_id = $2
        FOR UPDATE
      `,
      [documentId, applicationId]
    );

    if (documentResult.rows.length === 0) {
      throw createDeletionError(
        "Verification document not found.",
        404
      );
    }

    const document = documentResult.rows[0];

    if (
      !["image", "raw"].includes(
        document.cloudinary_resource_type
      )
    ) {
      throw createDeletionError(
        "Unsupported verification document resource type.",
        409
      );
    }

    // Delete the authenticated Cloudinary asset.
    // The database transaction remains open to prevent concurrent
    // changes to this draft and document during deletion.
    const cloudinaryResult = await cloudinary.uploader.destroy(
      document.cloudinary_public_id,
      {
        resource_type: document.cloudinary_resource_type,
        type: "authenticated",
        invalidate: true
      }
    );

    if (
      !cloudinaryResult ||
      !["ok", "not found"].includes(cloudinaryResult.result)
    ) {
      logDeletionEvent(
        "professional_verification_document_cloudinary_deletion_unconfirmed",
        {
          ...logContext,
          cloudinary_result:
            cloudinaryResult?.result || "missing_result"
        }
      );

      throw createDeletionError(
        "The document could not be deleted from secure storage.",
        502
      );
    }

    // "not found" is accepted because an earlier attempt may have
    // deleted the Cloudinary asset before its database transaction failed.
    const deleteResult = await client.query(
      `
        DELETE FROM professional_verification_documents
        WHERE id = $1
          AND application_id = $2
        RETURNING id
      `,
      [documentId, applicationId]
    );

    if (deleteResult.rows.length === 0) {
      throw createDeletionError(
        "The verification document record could not be deleted.",
        409
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    logDeletionEvent(
      "professional_verification_document_deleted",
      {
        ...logContext,
        cloudinary_deletion_result: cloudinaryResult.result
      }
    );

    return {
      message: "Verification document deleted successfully.",
      document_id: documentId
    };
  } catch (error) {
    if (transactionStarted) {
      await rollbackSafely(client, logContext);
      transactionStarted = false;
    }

    logDeletionError(
      "professional_verification_document_deletion_failed",
      error,
      logContext
    );

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  deleteProfessionalVerificationDocument
};
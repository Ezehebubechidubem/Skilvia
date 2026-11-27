
const { pool } = require("../config/database");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const REVIEW_DECISIONS = new Set([
  "approved",
  "rejected"
]);

const logSafeReviewError = (
  error,
  adminId,
  applicationId
) => {
  const stackFrames = typeof error.stack === "string"
    ? error.stack.split("\n").slice(1, 8)
    : [];

  console.error(JSON.stringify({
    event: "professional_verification_review_failed",
    timestamp: new Date().toISOString(),
    operation: "admin_review",
    admin_id: adminId,
    application_id: applicationId,
    error_name: error.name || "Error",
    error_code: error.code || null,
    database_constraint: error.constraint || null,
    stack_frames: stackFrames
  }));
};

const reviewProfessionalVerificationApplication = async ({
  adminId,
  applicationId,
  decision,
  rejectionReason = null,
  adminNotes = null
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
    typeof applicationId !== "string" ||
    !applicationId.trim()
  ) {
    throw new ProfessionalVerificationError(
      "A valid verification application ID is required.",
      400
    );
  }

  if (!REVIEW_DECISIONS.has(decision)) {
    throw new ProfessionalVerificationError(
      "Review decision must be approved or rejected.",
      400
    );
  }

  let normalizedRejectionReason = null;

  if (decision === "rejected") {
    if (
      typeof rejectionReason !== "string" ||
      !rejectionReason.trim()
    ) {
      throw new ProfessionalVerificationError(
        "A rejection reason is required.",
        400
      );
    }

    normalizedRejectionReason = rejectionReason.trim();

    if (normalizedRejectionReason.length > 2000) {
      throw new ProfessionalVerificationError(
        "Rejection reason cannot exceed 2000 characters.",
        400
      );
    }
  }

  let normalizedAdminNotes = null;

  if (adminNotes !== null && adminNotes !== undefined) {
    if (typeof adminNotes !== "string") {
      throw new ProfessionalVerificationError(
        "Administrator notes must be text.",
        400
      );
    }

    normalizedAdminNotes = adminNotes.trim();

    if (normalizedAdminNotes.length > 5000) {
      throw new ProfessionalVerificationError(
        "Administrator notes cannot exceed 5000 characters.",
        400
      );
    }

    if (!normalizedAdminNotes) {
      normalizedAdminNotes = null;
    }
  }

  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Find the professional profile associated with the application.
    // This initial lookup does not acquire a row lock.
    const applicationReference = await client.query(
      `
        SELECT
          id,
          professional_profile_id
        FROM professional_verification_applications
        WHERE id = $1
      `,
      [applicationId]
    );

    if (applicationReference.rowCount === 0) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    const professionalProfileId =
      applicationReference.rows[0].professional_profile_id;

    // Lock the professional profile first.
    // This follows the locking order used by the professional
    // verification submission services.
    const profileResult = await client.query(
      `
        SELECT
          id,
          verification_status
        FROM professional_profiles
        WHERE id = $1
        FOR UPDATE
      `,
      [professionalProfileId]
    );

    if (profileResult.rowCount === 0) {
      throw new ProfessionalVerificationError(
        "Professional profile not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    // Lock and recheck the application after locking its profile.
    const applicationResult = await client.query(
      `
        SELECT
          id,
          professional_profile_id,
          submitted_by,
          status,
          legal_full_name
        FROM professional_verification_applications
        WHERE id = $1
          AND professional_profile_id = $2
        FOR UPDATE
      `,
      [
        applicationId,
        professionalProfileId
      ]
    );

    if (applicationResult.rowCount === 0) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    const application = applicationResult.rows[0];

    if (application.status !== "pending") {
      throw new ProfessionalVerificationError(
        "Only pending verification applications can be reviewed.",
        409
      );
    }

    if (profile.verification_status !== "pending") {
      throw new ProfessionalVerificationError(
        "The professional verification status is inconsistent with this application.",
        409
      );
    }

    const nextVerificationStatus = decision;
    const verifiedAt = decision === "approved"
      ? new Date()
      : null;

    // Update the application review record.
    const updatedApplicationResult = await client.query(
      `
        UPDATE professional_verification_applications
        SET
          status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          rejection_reason = $3,
          admin_notes = $4,
          updated_at = NOW()
        WHERE id = $5
          AND status = 'pending'
        RETURNING
          id,
          professional_profile_id,
          status,
          reviewed_by,
          reviewed_at,
          rejection_reason,
          admin_notes,
          submitted_at,
          updated_at
      `,
      [
        decision,
        adminId,
        normalizedRejectionReason,
        normalizedAdminNotes,
        applicationId
      ]
    );

    if (updatedApplicationResult.rowCount !== 1) {
      throw new ProfessionalVerificationError(
        "The application could not be updated. It may already have been reviewed.",
        409
      );
    }

    // Keep the professional profile status synchronized
    // with the application review decision.
    const updatedProfileResult = await client.query(
      `
        UPDATE professional_profiles
        SET
          verification_status = $1,
          verified_at = $2
        WHERE id = $3
          AND verification_status = 'pending'
        RETURNING
          id,
          verification_status,
          verified_at
      `,
      [
        nextVerificationStatus,
        verifiedAt,
        professionalProfileId
      ]
    );

    if (updatedProfileResult.rowCount !== 1) {
      throw new ProfessionalVerificationError(
        "The professional verification profile could not be updated.",
        409
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    // Safe operational log: no names, identity documents,
    // rejection reasons, notes, tokens or payment information.
    console.info(JSON.stringify({
      event: "professional_verification_review_completed",
      timestamp: new Date().toISOString(),
      operation: "admin_review",
      admin_id: adminId,
      application_id: applicationId,
      professional_profile_id: professionalProfileId,
      decision
    }));

    return {
      message: decision === "approved"
        ? "Professional verification application approved successfully."
        : "Professional verification application rejected successfully.",
      application: updatedApplicationResult.rows[0],
      professional: updatedProfileResult.rows[0]
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    if (!(error instanceof ProfessionalVerificationError)) {
      logSafeReviewError(
        error,
        adminId,
        applicationId
      );
    }

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  reviewProfessionalVerificationApplication
};

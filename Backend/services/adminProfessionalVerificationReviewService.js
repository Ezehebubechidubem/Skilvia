const { pool } = require("../config/database");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const {
  recordAdminAudit
} = require("./adminAuditService");

const logReviewError = (error, context = {}) => {
  console.error(JSON.stringify({
    event: "admin_professional_verification_review_failed",
    timestamp: new Date().toISOString(),
    admin_id: context.adminId || null,
    application_id: context.applicationId || null,
    decision: context.decision || null,
    error_name: error?.name || "Error",
    error_code: error?.code || null,
    database_constraint: error?.constraint || null
  }));
};

const reviewProfessionalVerificationApplication = async ({
  adminId,
  applicationId,
  decision,
  rejectionReason = null,
  adminNotes = null,
  ipAddress = null,
  userAgent = null,
  requestId = null
}) => {
  if (!adminId || typeof adminId !== "string") {
    throw new ProfessionalVerificationError(
      "A valid administrator account is required.",
      401
    );
  }

  if (!applicationId || typeof applicationId !== "string") {
    throw new ProfessionalVerificationError(
      "A valid verification application is required."
    );
  }

  if (!["approved", "rejected"].includes(decision)) {
    throw new ProfessionalVerificationError(
      "The review decision is invalid."
    );
  }

  if (
    decision === "rejected" &&
    (
      typeof rejectionReason !== "string" ||
      !rejectionReason.trim()
    )
  ) {
    throw new ProfessionalVerificationError(
      "A rejection reason is required."
    );
  }

  if (
    rejectionReason !== null &&
    (
      typeof rejectionReason !== "string" ||
      rejectionReason.length > 2000
    )
  ) {
    throw new ProfessionalVerificationError(
      "The rejection reason is invalid."
    );
  }

  if (
    adminNotes !== null &&
    (
      typeof adminNotes !== "string" ||
      adminNotes.length > 5000
    )
  ) {
    throw new ProfessionalVerificationError(
      "The administrator notes are invalid."
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Find the application owner before acquiring locks.
    // The application-to-profile relationship is immutable.
    const referenceResult = await client.query(
      `
        SELECT professional_profile_id
        FROM professional_verification_applications
        WHERE application_id = $1
        LIMIT 1
      `,
      [applicationId]
    );

    const applicationReference = referenceResult.rows[0];

    if (!applicationReference) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    // Lock the professional profile first.
    // This follows the same lock order used by the professional
    // verification application services.
    const profileResult = await client.query(
      `
        SELECT
          pp.id AS professional_profile_id,
          pp.verification_status,
          pp.verified_at
        FROM professional_profiles pp
        WHERE pp.id = $1
        FOR UPDATE
      `,
      [applicationReference.professional_profile_id]
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      throw new ProfessionalVerificationError(
        "Professional profile not found.",
        404
      );
    }

    // Lock the application after its profile.
    const applicationResult = await client.query(
      `
        SELECT
          application_id,
          professional_profile_id,
          submitted_by,
          status,
          reviewed_by,
          reviewed_at
        FROM professional_verification_applications
        WHERE
          application_id = $1
          AND professional_profile_id = $2
        FOR UPDATE
      `,
      [
        applicationId,
        profile.professional_profile_id
      ]
    );

    const application = applicationResult.rows[0];

    if (!application) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    if (
      application.status !== "pending" ||
      profile.verification_status !== "pending"
    ) {
      throw new ProfessionalVerificationError(
        "This application is no longer awaiting review.",
        409
      );
    }

    const normalizedRejectionReason =
      decision === "rejected"
        ? rejectionReason.trim()
        : null;

    const normalizedAdminNotes =
      typeof adminNotes === "string"
        ? adminNotes.trim() || null
        : null;

    // Update the application review decision.
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
        WHERE application_id = $5
        RETURNING
          application_id,
          professional_profile_id,
          submitted_by,
          status,
          reviewed_by,
          reviewed_at,
          rejection_reason,
          admin_notes,
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

    // Keep the professional profile status synchronized.
    const updatedProfileResult = await client.query(
      `
        UPDATE professional_profiles
        SET
          verification_status = $1,
          verified_at = CASE
            WHEN $1 = 'approved' THEN NOW()
            ELSE NULL
          END
        WHERE id = $2
        RETURNING
          id AS professional_profile_id,
          verification_status,
          verified_at
      `,
      [
        decision,
        profile.professional_profile_id
      ]
    );

    const updatedApplication = updatedApplicationResult.rows[0];
    const updatedProfile = updatedProfileResult.rows[0];

    // Record the decision in the existing immutable admin audit log.
    // This uses the same transaction client, so both changes succeed
    // together or both are rolled back.
    await recordAdminAudit(
      {
        actorUserId: adminId,
        action: `professional_verification.${decision}`,
        entityType: "professional_verification_application",
        entityId: applicationId,
        beforeData: {
          application_status: application.status,
          profile_verification_status: profile.verification_status,
          reviewed_by: application.reviewed_by,
          reviewed_at: application.reviewed_at
        },
        afterData: {
          application_status: updatedApplication.status,
          profile_verification_status: updatedProfile.verification_status,
          reviewed_by: updatedApplication.reviewed_by,
          reviewed_at: updatedApplication.reviewed_at
        },
        ipAddress,
        userAgent,
        requestId
      },
      client
    );

    await client.query("COMMIT");

    console.info(JSON.stringify({
      event: "admin_professional_verification_review_completed",
      timestamp: new Date().toISOString(),
      admin_id: adminId,
      application_id: applicationId,
      professional_profile_id: updatedProfile.professional_profile_id,
      decision
    }));

    return {
      application: updatedApplication,
      professional_profile: updatedProfile
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(JSON.stringify({
        event: "admin_professional_verification_review_rollback_failed",
        timestamp: new Date().toISOString(),
        admin_id: adminId,
        application_id: applicationId,
        error_name: rollbackError?.name || "Error",
        error_code: rollbackError?.code || null
      }));
    }

    logReviewError(error, {
      adminId,
      applicationId,
      decision
    });

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  reviewProfessionalVerificationApplication
};
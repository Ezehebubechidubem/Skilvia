const { pool } = require("../config/database");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const SERVICE_NAME = "professionalVerificationSubmissionService";

const REQUIRED_IDENTITY_DOCUMENT_TYPES = [
  "national_id",
  "drivers_license",
  "international_passport",
  "voters_card"
];

const logVerificationEvent = (event, details = {}) => {
  console.info(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    ...details
  }));
};

const logVerificationError = (event, error, details = {}) => {
  console.error(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    error_name: error?.name || "Error",
    error_code: error?.code || null,
    status_code: error?.statusCode || null,
    ...details
  }));
};

const createSubmissionError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

/*
 * Validate an optional date of birth.
 *
 * The database value may be returned as a string or Date object.
 * The date must be a valid calendar date and must be in the past.
 */
const isValidPastDate = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  let dateString;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return false;
    }

    dateString = value.toISOString().slice(0, 10);
  } else if (typeof value === "string") {
    dateString = value.trim();
  } else {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const parsedDate = new Date(
    `${dateString}T00:00:00.000Z`
  );

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== dateString
  ) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  return dateString < today;
};

/*
 * Revalidate persisted application details immediately before
 * submission. Draft validation alone is not sufficient because
 * the submission boundary must enforce the final requirements.
 *
 * Current business contract:
 * - Legal full name: required.
 * - Country: required.
 * - Date of birth: optional, but must be valid if supplied.
 * - State and city: optional.
 */
const validateApplicationForSubmission = (application) => {
  if (
    typeof application.legal_full_name !== "string" ||
    !application.legal_full_name.trim()
  ) {
    throw createSubmissionError(
      "Enter your legal full name before submitting your verification application.",
      400
    );
  }

  if (
    typeof application.country !== "string" ||
    !application.country.trim()
  ) {
    throw createSubmissionError(
      "Select your country before submitting your verification application.",
      400
    );
  }

  if (!isValidPastDate(application.date_of_birth)) {
    throw createSubmissionError(
      "Your date of birth must be a valid date in the past.",
      400
    );
  }
};

const rollbackSafely = async (client, details = {}) => {
  try {
    await client.query("ROLLBACK");

    logVerificationEvent(
      "professional_verification_submission_rollback_succeeded",
      details
    );
  } catch (rollbackError) {
    logVerificationError(
      "professional_verification_submission_rollback_failed",
      rollbackError,
      details
    );
  }
};

const submitDraftForReview = async (userId, applicationId) => {
  if (!userId || !applicationId) {
    throw createSubmissionError(
      "User and application identifiers are required.",
      400
    );
  }

  const client = await pool.connect();

  let transactionStarted = false;
  let commitAttempted = false;

  const logContext = {
    user_id: userId,
    application_id: applicationId
  };

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the professional profile first.
    // This serializes submission against draft editing,
    // document uploads and document deletion.
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
      throw createSubmissionError(
        "Professional profile not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    if (profile.role !== "professional") {
      throw createSubmissionError(
        "Only professional accounts can submit verification.",
        403
      );
    }

    if (profile.account_status !== "active") {
      throw createSubmissionError(
        "Your account is not active.",
        403
      );
    }

    if (profile.verification_status === "approved") {
      throw createSubmissionError(
        "Your verification is already approved and cannot be resubmitted.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw createSubmissionError(
        "Your verification is already awaiting review.",
        409
      );
    }

    if (
      !["not_submitted", "rejected"].includes(
        profile.verification_status
      )
    ) {
      throw createSubmissionError(
        "Your professional verification status does not allow a new submission.",
        409
      );
    }

    // Lock the application and verify ownership.
    const applicationResult = await client.query(
      `
        SELECT
          id,
          professional_profile_id,
          submitted_by,
          status,
          legal_full_name,
          date_of_birth,
          country,
          state,
          city
        FROM professional_verification_applications
        WHERE id = $1
          AND professional_profile_id = $2
          AND submitted_by = $3
        FOR UPDATE
      `,
      [
        applicationId,
        profile.professional_profile_id,
        userId
      ]
    );

    if (applicationResult.rows.length === 0) {
      throw createSubmissionError(
        "Verification application not found.",
        404
      );
    }

    const application = applicationResult.rows[0];

    if (application.status !== "draft") {
      throw createSubmissionError(
        "Only draft applications can be submitted for review.",
        409
      );
    }

    // Validate the saved application details again.
    validateApplicationForSubmission(application);

    // Require at least one government-issued identity document.
    // Lock the selected document so it cannot be changed while
    // this submission transaction is being completed.
    const identityDocumentResult = await client.query(
      `
        SELECT
          id,
          document_type
        FROM professional_verification_documents
        WHERE application_id = $1
          AND document_type = ANY($2::text[])
        ORDER BY uploaded_at ASC, id ASC
        LIMIT 1
        FOR SHARE
      `,
      [
        applicationId,
        REQUIRED_IDENTITY_DOCUMENT_TYPES
      ]
    );

    if (identityDocumentResult.rows.length === 0) {
      throw createSubmissionError(
        "Upload at least one valid government-issued identity document before submitting your application.",
        400
      );
    }

    // Defensive check for another pending application.
    // The professional profile lock and database constraints
    // provide additional protection against concurrent submissions.
    const pendingApplicationResult = await client.query(
      `
        SELECT id
        FROM professional_verification_applications
        WHERE professional_profile_id = $1
          AND status = 'pending'
          AND id <> $2
        LIMIT 1
        FOR UPDATE
      `,
      [
        profile.professional_profile_id,
        applicationId
      ]
    );

    if (pendingApplicationResult.rows.length > 0) {
      throw createSubmissionError(
        "Another verification application is already awaiting review.",
        409
      );
    }

    // Submit the application.
    const updatedApplicationResult = await client.query(
      `
        UPDATE professional_verification_applications
        SET
          status = 'pending',
          submitted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND professional_profile_id = $2
          AND submitted_by = $3
          AND status = 'draft'
        RETURNING
          id,
          status,
          legal_full_name,
          submitted_at,
          updated_at
      `,
      [
        applicationId,
        profile.professional_profile_id,
        userId
      ]
    );

    if (updatedApplicationResult.rowCount !== 1) {
      throw createSubmissionError(
        "The application could not be submitted. Please try again.",
        409
      );
    }

    // Update the professional profile in the same transaction.
    const updatedProfileResult = await client.query(
      `
        UPDATE professional_profiles
        SET
          verification_status = 'pending',
          verified_at = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [profile.professional_profile_id]
    );

    if (updatedProfileResult.rowCount !== 1) {
      throw createSubmissionError(
        "The professional verification status could not be updated.",
        409
      );
    }

    commitAttempted = true;

    await client.query("COMMIT");
    transactionStarted = false;

    logVerificationEvent(
      "professional_verification_application_submitted",
      {
        ...logContext,
        professional_profile_id: profile.professional_profile_id,
        identity_document_id: identityDocumentResult.rows[0].id,
        identity_document_type: identityDocumentResult.rows[0].document_type,
        application_status: "pending"
      }
    );

    return {
      message: "Your verification application has been submitted for review.",
      application: updatedApplicationResult.rows[0]
    };
  } catch (error) {
    if (transactionStarted) {
      await rollbackSafely(client, logContext);
      transactionStarted = false;
    }

    if (commitAttempted) {
      logVerificationError(
        "professional_verification_submission_commit_outcome_unknown",
        error,
        logContext
      );
    }

    logVerificationError(
      "professional_verification_application_submission_failed",
      error,
      {
        ...logContext,
        status_code: error.statusCode || 500
      }
    );

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  submitDraftForReview
};
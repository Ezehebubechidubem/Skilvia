
const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  ProfessionalVerificationError,
  getProfessionalVerificationProfile
} = require("./professionalVerificationService");

const UPLOAD_SESSION_DURATION_MINUTES = 5;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp"
]);

const ALLOWED_RAW_FORMATS = new Set([
  "pdf"
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "national_id",
  "drivers_license",
  "international_passport",
  "voters_card",
  "proof_of_address",
  "business_registration",
  "selfie"
]);

const logVerificationEvent = (event, details = {}) => {
  console.info(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    service: "professionalVerificationUploadService",
    ...details
  }));
};

const logVerificationError = (event, error, details = {}) => {
  console.error(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    service: "professionalVerificationUploadService",
    error_name: error?.name || "Error",
    error_code: error?.code || null,
    ...details
  }));
};

const normalizeFormat = (format) => {
  if (typeof format !== "string") {
    return null;
  }

  return format.trim().toLowerCase().replace(/^\./, "");
};

const getDocumentResourceType = (format, documentType) => {
  const normalizedFormat = normalizeFormat(format);

  if (!normalizedFormat) {
    throw new ProfessionalVerificationError(
      "A valid document format is required."
    );
  }

  if (
    !ALLOWED_IMAGE_FORMATS.has(normalizedFormat) &&
    !ALLOWED_RAW_FORMATS.has(normalizedFormat)
  ) {
    throw new ProfessionalVerificationError(
      "Unsupported document format."
    );
  }

  if (
    documentType === "selfie" &&
    normalizedFormat === "pdf"
  ) {
    throw new ProfessionalVerificationError(
      "A selfie must be uploaded as an image."
    );
  }

  return ALLOWED_RAW_FORMATS.has(normalizedFormat)
    ? "raw"
    : "image";
};

const createVerificationUploadSession = async (
  userId,
  applicationId,
  data
) => {
  if (!userId || !applicationId) {
    throw new ProfessionalVerificationError(
      "User and application identifiers are required.",
      400
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new ProfessionalVerificationError(
      "Invalid upload-session details.",
      400
    );
  }

  const documentType = data.document_type;
  const fileFormat = normalizeFormat(data.file_format);

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw new ProfessionalVerificationError(
      "Unsupported verification document type.",
      400
    );
  }

  const resourceType = getDocumentResourceType(
    fileFormat,
    documentType
  );

  const uploadToken = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(uploadToken)
    .digest("hex");

  const publicId = [
    "skilvia",
    "professional-verification",
    crypto.randomUUID()
  ].join("/");

  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const profile = await getProfessionalVerificationProfile(
      client,
      userId,
      true
    );

    if (!profile) {
      throw new ProfessionalVerificationError(
        "Professional profile not found.",
        404
      );
    }

    if (
      profile.verification_status === "approved" ||
      profile.verification_status === "pending"
    ) {
      throw new ProfessionalVerificationError(
        "Document uploads are not available for this verification status.",
        403
      );
    }

    const applicationResult = await client.query(
      `
        SELECT
          id,
          professional_profile_id,
          submitted_by,
          status
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

    if (applicationResult.rowCount === 0) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    const application = applicationResult.rows[0];

    if (application.status !== "draft") {
      throw new ProfessionalVerificationError(
        "Documents can only be uploaded to a draft application.",
        403
      );
    }

    const sessionResult = await client.query(
      `
        INSERT INTO professional_verification_upload_sessions (
          application_id,
          uploaded_by,
          document_type,
          token_hash,
          cloudinary_public_id,
          resource_type,
          file_format,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          NOW() + ($8 * INTERVAL '1 minute')
        )
        RETURNING
          id,
          application_id,
          document_type,
          file_format,
          resource_type,
          expires_at
      `,
      [
        applicationId,
        userId,
        documentType,
        tokenHash,
        publicId,
        resourceType,
        fileFormat,
        UPLOAD_SESSION_DURATION_MINUTES
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    logVerificationEvent(
      "professional_verification_upload_session_created",
      {
        user_id: userId,
        application_id: applicationId,
        session_id: sessionResult.rows[0].id,
        document_type: documentType,
        resource_type: resourceType,
        file_format: fileFormat,
        expires_at: sessionResult.rows[0].expires_at
      }
    );

    return {
      upload_token: uploadToken,
      session: sessionResult.rows[0],
      upload_limits: {
        max_file_size_bytes: MAX_DOCUMENT_SIZE_BYTES,
        allowed_formats: [
          ...ALLOWED_IMAGE_FORMATS,
          ...ALLOWED_RAW_FORMATS
        ]
      }
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logVerificationError(
          "professional_verification_upload_session_rollback_failed",
          rollbackError,
          {
            user_id: userId,
            application_id: applicationId
          }
        );
      }
    }

    logVerificationError(
      "professional_verification_upload_session_creation_failed",
      error,
      {
        user_id: userId,
        application_id: applicationId,
        status_code: error.statusCode || 500
      }
    );

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createVerificationUploadSession,
  MAX_DOCUMENT_SIZE_BYTES,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RAW_FORMATS,
  ALLOWED_DOCUMENT_TYPES,
  normalizeFormat,
  getDocumentResourceType
};

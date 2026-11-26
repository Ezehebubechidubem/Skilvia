
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
  if (!data || typeof data !== "object") {
    throw new ProfessionalVerificationError(
      "Invalid upload-session details."
    );
  }

  const documentType = data.document_type;
  const fileFormat = normalizeFormat(data.file_format);

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw new ProfessionalVerificationError(
      "Unsupported verification document type."
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

  try {
    await client.query("BEGIN");

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
        profile.id,
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
    await client.query("ROLLBACK").catch(() => {});
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

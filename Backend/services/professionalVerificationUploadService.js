
const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const UPLOAD_SESSION_DURATION_MS = 5 * 60 * 1000;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_FORMATS = [
  "jpg",
  "jpeg",
  "png",
  "webp"
];

const ALLOWED_RAW_FORMATS = ["pdf"];

const ALLOWED_DOCUMENT_TYPES = [
  "national_id",
  "drivers_license",
  "international_passport",
  "voters_card",
  "proof_of_address",
  "business_registration",
  "selfie"
];

const createUploadError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

const generateUploadToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const hashUploadToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const getDocumentResourceType = (documentType, fileFormat) => {
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    throw createUploadError("Unsupported verification document type.");
  }

  const normalizedFormat = String(fileFormat).toLowerCase();

  if (
    !ALLOWED_IMAGE_FORMATS.includes(normalizedFormat) &&
    !ALLOWED_RAW_FORMATS.includes(normalizedFormat)
  ) {
    throw createUploadError("Unsupported document file format.");
  }

  if (
    documentType === "selfie" &&
    normalizedFormat === "pdf"
  ) {
    throw createUploadError("A selfie must be uploaded as an image.");
  }

  return normalizedFormat === "pdf" ? "raw" : "image";
};

const createVerificationUploadSession = async (
  userId,
  applicationId,
  documentType,
  fileFormat
) => {
  assertCloudinaryConfigured();

  const resourceType = getDocumentResourceType(
    documentType,
    fileFormat
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the professional profile to serialize verification changes.
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
      throw createUploadError(
        "Professional profile not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    if (profile.role !== "professional") {
      throw createUploadError(
        "Only professionals can upload verification documents.",
        403
      );
    }

    if (profile.account_status !== "active") {
      throw createUploadError(
        "Your account is not active.",
        403
      );
    }

    if (profile.verification_status === "approved") {
      throw createUploadError(
        "Your verification has already been approved. Your identification documents are locked.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw createUploadError(
        "Your verification is under review. Document uploads are locked.",
        409
      );
    }

    // Only draft applications accept new document uploads.
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
      throw createUploadError(
        "Verification application not found.",
        404
      );
    }

    const application = applicationResult.rows[0];

    if (application.status !== "draft") {
      throw createUploadError(
        "Documents can only be uploaded while your verification application is a draft.",
        409
      );
    }

    const token = generateUploadToken();
    const tokenHash = hashUploadToken(token);

    const publicId = [
      "skilvia",
      "professional-verification",
      profile.professional_profile_id,
      applicationId,
      crypto.randomUUID()
    ].join("/");

    const timestamp = Math.floor(Date.now() / 1000);

    const expiresAt = new Date(
      Date.now() + UPLOAD_SESSION_DURATION_MS
    );

    const uploadParameters = {
      public_id: publicId,
      timestamp,
      type: "authenticated",
      overwrite: false
    };

    const signature = cloudinary.utils.api_sign_request(
      uploadParameters,
      process.env.CLOUDINARY_API_SECRET
    );

    await client.query(
      `
        INSERT INTO professional_verification_upload_sessions (
          application_id,
          uploaded_by,
          document_type,
          token_hash,
          cloudinary_public_id,
          cloudinary_resource_type,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        applicationId,
        userId,
        documentType,
        tokenHash,
        publicId,
        resourceType,
        expiresAt
      ]
    );

    await client.query("COMMIT");

    return {
      upload_token: token,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      public_id: publicId,
      type: "authenticated",
      overwrite: false,
      resource_type: resourceType,
      upload_url:
        `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      restrictions: {
        max_file_size_bytes: MAX_DOCUMENT_SIZE_BYTES,
        allowed_formats:
          resourceType === "raw"
            ? ALLOWED_RAW_FORMATS
            : ALLOWED_IMAGE_FORMATS
      },
      expires_at: expiresAt
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createVerificationUploadSession,
  hashUploadToken,
  MAX_DOCUMENT_SIZE_BYTES,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RAW_FORMATS,
  ALLOWED_DOCUMENT_TYPES
};

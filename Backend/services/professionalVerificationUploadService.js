const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const env = require("../config/environment");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");


// =====================================================
// CONSTANTS
// =====================================================

const UPLOAD_SESSION_DURATION_MS = 5 * 60 * 1000;

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_FORMATS = [
  "jpg",
  "jpeg",
  "png",
  "webp"
];

const ALLOWED_RAW_FORMATS = [
  "pdf"
];

const ALLOWED_DOCUMENT_TYPES = [
  "national_id",
  "drivers_license",
  "international_passport",
  "voters_card",
  "proof_of_address",
  "business_registration",
  "selfie"
];


// =====================================================
// ERROR HANDLING
// =====================================================

const createUploadError = (
  message,
  statusCode = 400,
  code = "PROFESSIONAL_UPLOAD_ERROR"
) => {
  const error = new ProfessionalVerificationError(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
};


// =====================================================
// TOKEN GENERATION
// =====================================================

const generateUploadToken = () => {
  return crypto.randomBytes(32).toString("hex");
};


const hashUploadToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};


// =====================================================
// DOCUMENT VALIDATION
// =====================================================

const getDocumentResourceType = (documentType, fileFormat) => {
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    throw createUploadError(
      "Unsupported verification document type."
    );
  }

  const normalizedFormat = String(fileFormat || "")
    .toLowerCase();

  if (
    !ALLOWED_IMAGE_FORMATS.includes(normalizedFormat) &&
    !ALLOWED_RAW_FORMATS.includes(normalizedFormat)
  ) {
    throw createUploadError(
      "Unsupported document file format."
    );
  }

  if (
    documentType === "selfie" &&
    normalizedFormat === "pdf"
  ) {
    throw createUploadError(
      "A selfie must be uploaded as an image."
    );
  }

  return ALLOWED_RAW_FORMATS.includes(normalizedFormat)
    ? "raw"
    : "image";
};


// =====================================================
// CREATE VERIFICATION UPLOAD AUTHORIZATION
// =====================================================

const createVerificationUploadSession = async (
  userId,
  applicationId,
  documentType,
  fileFormat
) => {
  assertCloudinaryConfigured();

  if (!userId || !applicationId) {
    throw createUploadError(
      "Professional and application identifiers are required."
    );
  }

  const normalizedFormat = String(fileFormat || "")
    .toLowerCase();

  const resourceType = getDocumentResourceType(
    documentType,
    normalizedFormat
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // -------------------------------------------------
    // VERIFY PROFESSIONAL OWNERSHIP
    // -------------------------------------------------

    const profileResult = await client.query(
      `
        SELECT
          pp.id AS professional_profile_id,
          u.role,
          u.account_status
        FROM professional_profiles pp
        INNER JOIN users u
          ON u.id = pp.user_id
        WHERE pp.user_id = $1
        FOR UPDATE OF pp
      `,
      [userId]
    );

    if (profileResult.rowCount === 0) {
      throw createUploadError(
        "Professional profile was not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    if (profile.role !== "professional") {
      throw createUploadError(
        "Only professional accounts can upload verification documents.",
        403
      );
    }

    if (profile.account_status !== "active") {
      throw createUploadError(
        "Your account is not active.",
        403
      );
    }

    // -------------------------------------------------
    // VERIFY APPLICATION OWNERSHIP
    // -------------------------------------------------

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

    if (applicationResult.rowCount === 0) {
      throw createUploadError(
        "Verification application was not found.",
        404
      );
    }

    if (applicationResult.rows[0].status !== "pending") {
      throw createUploadError(
        "Documents can only be uploaded to a pending verification application.",
        409
      );
    }

    // -------------------------------------------------
    // GENERATE SECURE UPLOAD IDENTIFIERS
    // -------------------------------------------------

    const uploadToken = generateUploadToken();

    const tokenHash = hashUploadToken(uploadToken);

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

    // -------------------------------------------------
    // GENERATE CLOUDINARY SIGNATURE
    // -------------------------------------------------

    const signatureParameters = {
      public_id: publicId,
      timestamp,
      type: "authenticated",
      overwrite: false
    };

    const signature = cloudinary.utils.api_sign_request(
      signatureParameters,
      env.CLOUDINARY_API_SECRET
    );

    // -------------------------------------------------
    // STORE UPLOAD SESSION
    // -------------------------------------------------

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

    // -------------------------------------------------
    // RETURN UPLOAD AUTHORIZATION
    // -------------------------------------------------

    return {
      upload_token: uploadToken,

      upload: {
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        timestamp,
        signature,
        public_id: publicId,
        type: "authenticated",
        overwrite: false,
        resource_type: resourceType,
        upload_url:
          `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`
      },

      restrictions: {
        max_file_size_bytes: MAX_DOCUMENT_SIZE_BYTES,
        allowed_formats: [
          ...ALLOWED_IMAGE_FORMATS,
          ...ALLOWED_RAW_FORMATS
        ]
      },

      expires_at: expiresAt.toISOString()
    };

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createVerificationUploadSession,
  MAX_DOCUMENT_SIZE_BYTES,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RAW_FORMATS
};
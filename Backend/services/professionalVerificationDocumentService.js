const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const {
  ProfessionalVerificationError
} = require("./professionalVerificationService");

const {
  MAX_DOCUMENT_SIZE_BYTES,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RAW_FORMATS
} = require("./professionalVerificationUploadService");


// =====================================================
// ERROR HANDLING
// =====================================================

const createDocumentError = (
  message,
  statusCode = 400,
  code = "PROFESSIONAL_DOCUMENT_ERROR"
) => {
  const error = new ProfessionalVerificationError(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
};


// =====================================================
// TOKEN HASHING
// =====================================================

const hashUploadToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};


// =====================================================
// CLOUDINARY ASSET VERIFICATION
// =====================================================

const verifyCloudinaryAsset = async (session) => {
  let asset;

  try {
    asset = await cloudinary.api.resource(
      session.cloudinary_public_id,
      {
        resource_type: session.cloudinary_resource_type,
        type: "authenticated"
      }
    );

  } catch (error) {
    if (
      error.http_code === 404 ||
      error.error?.http_code === 404
    ) {
      throw createDocumentError(
        "The uploaded document could not be found.",
        404,
        "DOCUMENT_NOT_FOUND"
      );
    }

    throw createDocumentError(
      "Unable to verify the uploaded document with Cloudinary.",
      502,
      "CLOUDINARY_VERIFICATION_FAILED"
    );
  }

  // -------------------------------------------------
  // VERIFY ASSET IDENTIFIER
  // -------------------------------------------------

  if (asset.public_id !== session.cloudinary_public_id) {
    throw createDocumentError(
      "Uploaded document identifier does not match the authorized upload.",
      400,
      "DOCUMENT_IDENTIFIER_MISMATCH"
    );
  }

  // -------------------------------------------------
  // VERIFY RESOURCE TYPE
  // -------------------------------------------------

  if (
    asset.resource_type !==
    session.cloudinary_resource_type
  ) {
    throw createDocumentError(
      "Uploaded document has an invalid resource type."
    );
  }

  // -------------------------------------------------
  // VERIFY DELIVERY TYPE
  // -------------------------------------------------

  if (asset.type !== "authenticated") {
    throw createDocumentError(
      "Verification documents must use authenticated Cloudinary delivery."
    );
  }

  // -------------------------------------------------
  // VERIFY FILE SIZE
  // -------------------------------------------------

  const fileSize = Number(asset.bytes);

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw createDocumentError(
      "Document size is invalid or exceeds the 10 MB limit."
    );
  }

  // -------------------------------------------------
  // VERIFY ACTUAL FILE FORMAT
  // -------------------------------------------------

  const fileFormat = String(asset.format || "")
    .toLowerCase();

  if (session.cloudinary_resource_type === "image") {
    if (!ALLOWED_IMAGE_FORMATS.includes(fileFormat)) {
      throw createDocumentError(
        "The uploaded image format is not supported."
      );
    }
  } else if (session.cloudinary_resource_type === "raw") {
    if (!ALLOWED_RAW_FORMATS.includes(fileFormat)) {
      throw createDocumentError(
        "The uploaded document format is not supported."
      );
    }
  } else {
    throw createDocumentError(
      "Unsupported Cloudinary resource type."
    );
  }

  if (
    session.document_type === "selfie" &&
    fileFormat === "pdf"
  ) {
    throw createDocumentError(
      "A selfie must be uploaded as an image."
    );
  }

  return {
    file_format: fileFormat,
    file_size_bytes: fileSize,
    resource_type: asset.resource_type
  };
};


// =====================================================
// REGISTER PROFESSIONAL VERIFICATION DOCUMENT
// =====================================================

const registerVerificationDocument = async (
  userId,
  applicationId,
  uploadToken
) => {
  assertCloudinaryConfigured();

  if (!userId || !applicationId || !uploadToken) {
    throw createDocumentError(
      "Professional, application and upload token are required."
    );
  }

  const tokenHash = hashUploadToken(uploadToken);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // -------------------------------------------------
    // LOCK AND VALIDATE UPLOAD SESSION
    // -------------------------------------------------

    const sessionResult = await client.query(
      `
        SELECT
          us.id,
          us.application_id,
          us.uploaded_by,
          us.document_type,
          us.cloudinary_public_id,
          us.cloudinary_resource_type,
          us.expires_at,
          us.consumed_at,
          u.account_status
        FROM professional_verification_upload_sessions us
        INNER JOIN users u
          ON u.id = us.uploaded_by
        WHERE us.token_hash = $1
          AND us.application_id = $2
          AND us.uploaded_by = $3
        FOR UPDATE OF us
      `,
      [
        tokenHash,
        applicationId,
        userId
      ]
    );

    if (sessionResult.rowCount === 0) {
      throw createDocumentError(
        "Invalid upload authorization.",
        403,
        "INVALID_UPLOAD_TOKEN"
      );
    }

    const session = sessionResult.rows[0];

    if (session.account_status !== "active") {
      throw createDocumentError(
        "Your account is not active.",
        403
      );
    }

    if (session.consumed_at) {
      throw createDocumentError(
        "This upload authorization has already been used.",
        409,
        "UPLOAD_TOKEN_ALREADY_USED"
      );
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw createDocumentError(
        "Upload authorization has expired. Request a new one.",
        410,
        "UPLOAD_TOKEN_EXPIRED"
      );
    }

    // -------------------------------------------------
    // VERIFY APPLICATION STATUS
    // -------------------------------------------------

    const applicationResult = await client.query(
      `
        SELECT
          id,
          status
        FROM professional_verification_applications
        WHERE id = $1
        FOR UPDATE
      `,
      [applicationId]
    );

    if (applicationResult.rowCount === 0) {
      throw createDocumentError(
        "Verification application was not found.",
        404
      );
    }

    if (applicationResult.rows[0].status !== "pending") {
      throw createDocumentError(
        "This verification application no longer accepts documents.",
        409
      );
    }

    // -------------------------------------------------
    // VERIFY CLOUDINARY ASSET
    // -------------------------------------------------

    const verifiedAsset = await verifyCloudinaryAsset(session);

    // -------------------------------------------------
    // REGISTER VERIFIED DOCUMENT METADATA
    // -------------------------------------------------

    const documentResult = await client.query(
      `
        INSERT INTO professional_verification_documents (
          application_id,
          document_type,
          cloudinary_public_id,
          cloudinary_resource_type,
          file_format,
          file_size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          application_id,
          document_type,
          cloudinary_resource_type,
          file_format,
          file_size_bytes,
          uploaded_at
      `,
      [
        applicationId,
        session.document_type,
        session.cloudinary_public_id,
        verifiedAsset.resource_type,
        verifiedAsset.file_format,
        verifiedAsset.file_size_bytes
      ]
    );

    // -------------------------------------------------
    // CONSUME UPLOAD AUTHORIZATION
    // -------------------------------------------------

    await client.query(
      `
        UPDATE professional_verification_upload_sessions
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND consumed_at IS NULL
      `,
      [session.id]
    );

    await client.query("COMMIT");

    return documentResult.rows[0];

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
  registerVerificationDocument
};
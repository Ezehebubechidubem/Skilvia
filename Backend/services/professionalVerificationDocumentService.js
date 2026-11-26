
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

const createDocumentError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

const hashUploadToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

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
        "The uploaded verification document could not be found.",
        400
      );
    }

    throw createDocumentError(
      "Unable to verify the uploaded document with secure storage.",
      502
    );
  }

  if (
    !asset ||
    asset.public_id !== session.cloudinary_public_id ||
    asset.resource_type !== session.cloudinary_resource_type ||
    asset.type !== "authenticated"
  ) {
    throw createDocumentError(
      "The uploaded file does not match its authorized upload session.",
      400
    );
  }

  if (
    !Number.isInteger(asset.bytes) ||
    asset.bytes <= 0 ||
    asset.bytes > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw createDocumentError(
      "The document must be greater than zero bytes and must not exceed 10 MB.",
      400
    );
  }

  const format = String(asset.format || "").toLowerCase();

  const allowedFormats =
    session.cloudinary_resource_type === "raw"
      ? ALLOWED_RAW_FORMATS
      : ALLOWED_IMAGE_FORMATS;

  if (!allowedFormats.includes(format)) {
    throw createDocumentError(
      "The uploaded document format is not allowed.",
      400
    );
  }

  if (
    session.document_type === "selfie" &&
    format === "pdf"
  ) {
    throw createDocumentError(
      "A selfie must be uploaded as an image.",
      400
    );
  }

  return {
    format,
    size: asset.bytes
  };
};

const registerVerificationDocument = async (
  userId,
  applicationId,
  uploadToken
) => {
  assertCloudinaryConfigured();

  if (
    typeof uploadToken !== "string" ||
    uploadToken.length < 20 ||
    uploadToken.length > 500
  ) {
    throw createDocumentError("Invalid upload token.");
  }

  const tokenHash = hashUploadToken(uploadToken);

  // First read the upload session without holding a database lock
  // during the external Cloudinary API request.
  const initialResult = await pool.query(
    `
      SELECT
        us.id AS upload_session_id,
        us.application_id,
        us.uploaded_by,
        us.document_type,
        us.cloudinary_public_id,
        us.cloudinary_resource_type,
        us.expires_at,
        us.consumed_at,
        pva.status AS application_status,
        pp.verification_status,
        u.account_status,
        u.role
      FROM professional_verification_upload_sessions us
      INNER JOIN professional_verification_applications pva
        ON pva.id = us.application_id
      INNER JOIN professional_profiles pp
        ON pp.id = pva.professional_profile_id
      INNER JOIN users u
        ON u.id = pp.user_id
      WHERE us.token_hash = $1
        AND us.application_id = $2
        AND us.uploaded_by = $3
      LIMIT 1
    `,
    [tokenHash, applicationId, userId]
  );

  if (initialResult.rows.length === 0) {
    throw createDocumentError(
      "Invalid verification upload session.",
      404
    );
  }

  const initialSession = initialResult.rows[0];

  if (initialSession.role !== "professional") {
    throw createDocumentError(
      "Only professional accounts can register verification documents.",
      403
    );
  }

  if (initialSession.account_status !== "active") {
    throw createDocumentError(
      "Your account is not active.",
      403
    );
  }

  if (initialSession.verification_status === "approved") {
    throw createDocumentError(
      "Your verification is already approved. Your identification documents are locked.",
      409
    );
  }

  if (initialSession.verification_status === "pending") {
    throw createDocumentError(
      "Your verification is under review. Document registration is locked.",
      409
    );
  }

  if (initialSession.application_status !== "draft") {
    throw createDocumentError(
      "Documents can only be registered while your application is a draft.",
      409
    );
  }

  if (initialSession.consumed_at) {
    throw createDocumentError(
      "This upload session has already been used.",
      409
    );
  }

  if (new Date(initialSession.expires_at).getTime() <= Date.now()) {
    throw createDocumentError(
      "This upload session has expired. Create a new upload session.",
      410
    );
  }

  // Verify the actual asset with Cloudinary before opening the
  // registration transaction.
  const verifiedAsset = await verifyCloudinaryAsset(
    initialSession
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the profile first. This serializes registration against
    // verification submission and other profile verification changes.
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
      throw createDocumentError(
        "Professional profile not found.",
        404
      );
    }

    const profile = profileResult.rows[0];

    if (
      profile.role !== "professional" ||
      profile.account_status !== "active"
    ) {
      throw createDocumentError(
        "Your account is not authorized to register verification documents.",
        403
      );
    }

    if (profile.verification_status === "approved") {
      throw createDocumentError(
        "Your verification is already approved. Your identification documents are locked.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw createDocumentError(
        "Your verification is under review. Document registration is locked.",
        409
      );
    }

    // Lock the application and confirm that it still belongs to
    // this professional and remains a draft.
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
      throw createDocumentError(
        "Verification application not found.",
        404
      );
    }

    if (applicationResult.rows[0].status !== "draft") {
      throw createDocumentError(
        "This application is no longer accepting document uploads.",
        409
      );
    }

    // Lock and recheck the upload session to prevent token reuse.
    const sessionResult = await client.query(
      `
        SELECT
          id,
          document_type,
          cloudinary_public_id,
          cloudinary_resource_type,
          expires_at,
          consumed_at
        FROM professional_verification_upload_sessions
        WHERE token_hash = $1
          AND application_id = $2
          AND uploaded_by = $3
        FOR UPDATE
      `,
      [tokenHash, applicationId, userId]
    );

    if (sessionResult.rows.length === 0) {
      throw createDocumentError(
        "Invalid verification upload session.",
        404
      );
    }

    const session = sessionResult.rows[0];

    if (session.consumed_at) {
      throw createDocumentError(
        "This upload session has already been used.",
        409
      );
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw createDocumentError(
        "This upload session has expired.",
        410
      );
    }

    // Ensure the session still refers to the exact asset verified
    // before the transaction started.
    if (
      session.cloudinary_public_id !==
        initialSession.cloudinary_public_id ||
      session.cloudinary_resource_type !==
        initialSession.cloudinary_resource_type ||
      session.document_type !== initialSession.document_type
    ) {
      throw createDocumentError(
        "The upload session changed during document verification.",
        409
      );
    }

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
          document_type,
          file_format,
          file_size_bytes,
          uploaded_at
      `,
      [
        applicationId,
        session.document_type,
        session.cloudinary_public_id,
        session.cloudinary_resource_type,
        verifiedAsset.format,
        verifiedAsset.size
      ]
    );

    await client.query(
      `
        UPDATE professional_verification_upload_sessions
        SET consumed_at = NOW()
        WHERE id = $1
      `,
      [session.id]
    );

    await client.query("COMMIT");

    return {
      message: "Verification document registered successfully.",
      document: documentResult.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  registerVerificationDocument
};

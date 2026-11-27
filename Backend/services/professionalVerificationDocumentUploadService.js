const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  cloudinary,
  assertCloudinaryConfigured
} = require("../config/cloudinary");

const {
  ProfessionalVerificationError,
  getProfessionalVerificationProfile
} = require("./professionalVerificationService");

const {
  MAX_DOCUMENT_SIZE_BYTES,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RAW_FORMATS,
  normalizeFormat
} = require("./professionalVerificationUploadService");

const SERVICE_NAME = "professionalVerificationDocumentUploadService";

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

const createVerificationError = (message, statusCode = 400) => {
  return new ProfessionalVerificationError(message, statusCode);
};

/*
 * Canonical format normalization.
 *
 * JPEG and JPG are the same image format.
 * Both are represented internally as "jpg".
 */
const canonicalizeFormat = (format) => {
  const normalized = normalizeFormat(format);

  if (normalized === "jpeg") {
    return "jpg";
  }

  return normalized;
};

const detectFileFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    return null;
  }

  // JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }

  // PNG
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a
      ])
    )
  ) {
    return "png";
  }

  // WebP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // PDF
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "pdf";
  }

  return null;
};

const validateDeclaredMimeType = (format, mimeType) => {
  const allowedMimeTypes = {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
    pdf: ["application/pdf"]
  };

  if (
    typeof mimeType !== "string" ||
    !mimeType.trim()
  ) {
    throw createVerificationError(
      "The uploaded document media type is missing.",
      400
    );
  }

  const allowed = allowedMimeTypes[format];

  if (!allowed || !allowed.includes(mimeType.toLowerCase().trim())) {
    throw createVerificationError(
      "The uploaded document content does not match its declared media type.",
      400
    );
  }
};

const uploadToCloudinary = (buffer, session) => {
  return new Promise((resolve, reject) => {
    let settled = false;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: session.cloudinary_public_id,
        resource_type: session.resource_type,
        type: "authenticated",
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        invalidate: false,
        allowed_formats: [
          ...ALLOWED_IMAGE_FORMATS,
          ...ALLOWED_RAW_FORMATS
        ]
      },
      (error, result) => {
        if (settled) {
          return;
        }

        settled = true;

        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(
            new Error("Cloudinary did not return an upload result.")
          );
        }

        resolve(result);
      }
    );

    uploadStream.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });

    try {
      uploadStream.end(buffer);
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
};

const deleteCloudinaryAsset = async (
  publicId,
  resourceType
) => {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true
  });
};

const getValidUploadSession = async (
  client,
  userId,
  applicationId,
  tokenHash
) => {
  const profile = await getProfessionalVerificationProfile(
    client,
    userId,
    true
  );

  if (!profile) {
    throw createVerificationError(
      "Professional profile not found.",
      404
    );
  }

  if (
    profile.verification_status === "approved" ||
    profile.verification_status === "pending"
  ) {
    throw createVerificationError(
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
    throw createVerificationError(
      "Verification application not found.",
      404
    );
  }

  const application = applicationResult.rows[0];

  if (application.status !== "draft") {
    throw createVerificationError(
      "Documents can only be uploaded to a draft application.",
      403
    );
  }

  const sessionResult = await client.query(
    `
      SELECT
        id,
        application_id,
        uploaded_by,
        document_type,
        token_hash,
        cloudinary_public_id,
        resource_type,
        file_format,
        expires_at,
        consumed_at
      FROM professional_verification_upload_sessions
      WHERE token_hash = $1
        AND application_id = $2
        AND uploaded_by = $3
      FOR UPDATE
    `,
    [
      tokenHash,
      applicationId,
      userId
    ]
  );

  if (sessionResult.rowCount === 0) {
    throw createVerificationError(
      "Invalid upload token.",
      401
    );
  }

  const session = sessionResult.rows[0];

  if (session.consumed_at) {
    throw createVerificationError(
      "This upload session has already been used.",
      409
    );
  }

  const expiryTime = new Date(session.expires_at).getTime();

  if (
    !Number.isFinite(expiryTime) ||
    expiryTime <= Date.now()
  ) {
    throw createVerificationError(
      "Upload session has expired. Create a new upload session.",
      410
    );
  }

  return session;
};

/*
 * The cleanup target is the predetermined session public ID.
 *
 * This also allows cleanup when Cloudinary processed the upload
 * but the upload callback returned an error or incomplete result.
 */
const cleanupCloudinaryAsset = async (
  publicId,
  resourceType,
  details = {}
) => {
  try {
    const result = await deleteCloudinaryAsset(
      publicId,
      resourceType
    );

    if (
      !result ||
      !["ok", "not found"].includes(result.result)
    ) {
      logVerificationEvent(
        "professional_verification_document_cleanup_unconfirmed",
        {
          ...details,
          cleanup_result: result?.result || "missing_result"
        }
      );

      return false;
    }

    logVerificationEvent(
      "professional_verification_document_cleanup_completed",
      {
        ...details,
        cleanup_result: result.result
      }
    );

    return true;
  } catch (error) {
    logVerificationError(
      "professional_verification_document_cleanup_failed",
      error,
      details
    );

    return false;
  }
};

const uploadVerificationDocument = async (
  userId,
  applicationId,
  uploadToken,
  file
) => {
  if (!userId || !applicationId) {
    throw createVerificationError(
      "User and application identifiers are required.",
      400
    );
  }

  if (
    typeof uploadToken !== "string" ||
    !/^[a-f0-9]{64}$/i.test(uploadToken)
  ) {
    throw createVerificationError(
      "A valid upload token is required.",
      400
    );
  }

  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createVerificationError(
      "A document file is required.",
      400
    );
  }

  if (
    file.buffer.length === 0 ||
    file.buffer.length > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw createVerificationError(
      "Document must be greater than 0 bytes and no larger than 10 MB.",
      413
    );
  }

  const actualFormat = detectFileFormat(file.buffer);

  if (!actualFormat) {
    throw createVerificationError(
      "The document contents are not a supported file format.",
      400
    );
  }

  validateDeclaredMimeType(actualFormat, file.mimetype);

  const tokenHash = crypto
    .createHash("sha256")
    .update(uploadToken)
    .digest("hex");

  assertCloudinaryConfigured();

  const client = await pool.connect();

  let transactionStarted = false;
  let commitAttempted = false;
  let uploadAttempted = false;
  let uploadedAsset = null;
  let session = null;

  const logContext = {
    user_id: userId,
    application_id: applicationId
  };

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    /*
     * Lock order:
     * 1. Professional profile.
     * 2. Application.
     * 3. Upload session.
     *
     * The transaction remains open during the Cloudinary upload.
     * This serializes simultaneous requests using the same session
     * and prevents application submission/deletion from racing
     * against this upload.
     */
    session = await getValidUploadSession(
      client,
      userId,
      applicationId,
      tokenHash
    );

    const expectedFormat = canonicalizeFormat(
      session.file_format
    );

    const canonicalActualFormat = canonicalizeFormat(
      actualFormat
    );

    if (
      !expectedFormat ||
      canonicalActualFormat !== expectedFormat
    ) {
      throw createVerificationError(
        "The uploaded file does not match the format selected when the upload session was created.",
        400
      );
    }

    const expectedResourceType = expectedFormat === "pdf"
      ? "raw"
      : "image";

    if (session.resource_type !== expectedResourceType) {
      throw createVerificationError(
        "The uploaded document resource type is invalid.",
        400
      );
    }

    uploadAttempted = true;

    uploadedAsset = await uploadToCloudinary(
      file.buffer,
      session
    );

    const cloudinaryFormat = canonicalizeFormat(
      uploadedAsset.format
    );

    if (
      uploadedAsset.public_id !== session.cloudinary_public_id ||
      uploadedAsset.resource_type !== session.resource_type ||
      cloudinaryFormat !== expectedFormat ||
      !Number.isInteger(uploadedAsset.bytes) ||
      uploadedAsset.bytes !== file.buffer.length ||
      uploadedAsset.bytes > MAX_DOCUMENT_SIZE_BYTES
    ) {
      throw createVerificationError(
        "Cloudinary returned an asset that does not match the upload session.",
        502
      );
    }

    const consumedResult = await client.query(
      `
        UPDATE professional_verification_upload_sessions
        SET consumed_at = NOW()
        WHERE id = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `,
      [session.id]
    );

    if (consumedResult.rowCount !== 1) {
      throw createVerificationError(
        "Upload session has expired or has already been used.",
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
        uploadedAsset.public_id,
        uploadedAsset.resource_type,
        cloudinaryFormat,
        uploadedAsset.bytes
      ]
    );

    /*
     * From this point onward, the outcome of COMMIT may be uncertain
     * if the database connection fails.
     *
     * Never delete the Cloudinary asset after COMMIT has been
     * attempted. A committed document might already reference it.
     */
    commitAttempted = true;

    await client.query("COMMIT");
    transactionStarted = false;

    logVerificationEvent(
      "professional_verification_document_uploaded",
      {
        ...logContext,
        document_id: documentResult.rows[0].id,
        upload_session_id: session.id,
        document_type: session.document_type,
        resource_type: uploadedAsset.resource_type,
        file_format: cloudinaryFormat,
        file_size_bytes: uploadedAsset.bytes
      }
    );

    return {
      message: "Verification document uploaded successfully.",
      document: documentResult.rows[0]
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logVerificationError(
          "professional_verification_document_rollback_failed",
          rollbackError,
          logContext
        );
      }

      transactionStarted = false;
    }

    if (commitAttempted) {
      /*
       * The commit result is uncertain.
       *
       * Keep the Cloudinary asset. Deleting it could break a document
       * whose database transaction actually committed.
       *
       * If the database transaction did not commit, this may leave
       * an orphaned Cloudinary asset. That is safer than deleting
       * an asset potentially referenced by a committed document.
       */
      logVerificationError(
        "professional_verification_document_commit_outcome_unknown",
        error,
        {
          ...logContext,
          upload_session_id: session?.id || null,
          asset_cleanup_skipped: true
        }
      );
    } else if (uploadAttempted && session?.cloudinary_public_id) {
      await cleanupCloudinaryAsset(
        session.cloudinary_public_id,
        session.resource_type,
        {
          ...logContext,
          upload_session_id: session.id
        }
      );
    }

    logVerificationError(
      "professional_verification_document_upload_failed",
      error,
      {
        ...logContext,
        upload_session_id: session?.id || null,
        status_code: error.statusCode || 500
      }
    );

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  uploadVerificationDocument,
  detectFileFormat
};
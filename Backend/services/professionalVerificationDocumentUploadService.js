
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

const detectFileFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }

  // PNG
  if (
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

const uploadToCloudinary = (buffer, session) => {
  return new Promise((resolve, reject) => {
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

    uploadStream.end(buffer);
  });
};

const deleteCloudinaryAsset = async (publicId, resourceType) => {
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
    throw new ProfessionalVerificationError(
      "Invalid upload token.",
      401
    );
  }

  const session = sessionResult.rows[0];

  if (session.consumed_at) {
    throw new ProfessionalVerificationError(
      "This upload session has already been used.",
      409
    );
  }

  const expiryTime = new Date(session.expires_at).getTime();

  if (
    !Number.isFinite(expiryTime) ||
    expiryTime <= Date.now()
  ) {
    throw new ProfessionalVerificationError(
      "Upload session has expired. Create a new upload session.",
      410
    );
  }

  return session;
};

const uploadVerificationDocument = async (
  userId,
  applicationId,
  uploadToken,
  file
) => {
  assertCloudinaryConfigured();

  if (
    typeof uploadToken !== "string" ||
    !/^[a-f0-9]{64}$/i.test(uploadToken)
  ) {
    throw new ProfessionalVerificationError(
      "A valid upload token is required.",
      400
    );
  }

  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new ProfessionalVerificationError(
      "A document file is required.",
      400
    );
  }

  if (
    file.buffer.length === 0 ||
    file.buffer.length > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw new ProfessionalVerificationError(
      "Document must be greater than 0 bytes and no larger than 10 MB.",
      413
    );
  }

  const actualFormat = detectFileFormat(file.buffer);

  if (!actualFormat) {
    throw new ProfessionalVerificationError(
      "The document contents are not a supported file format.",
      400
    );
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(uploadToken)
    .digest("hex");

  const client = await pool.connect();

  let session;

  try {
    // First check: validate ownership and session before uploading.
    await client.query("BEGIN");

    session = await getValidUploadSession(
      client,
      userId,
      applicationId,
      tokenHash
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const expectedFormat = normalizeFormat(session.file_format);

  if (actualFormat !== expectedFormat) {
    throw new ProfessionalVerificationError(
      "The uploaded file does not match the format selected when the upload session was created.",
      400
    );
  }

  const expectedResourceType = actualFormat === "pdf"
    ? "raw"
    : "image";

  if (session.resource_type !== expectedResourceType) {
    throw new ProfessionalVerificationError(
      "The uploaded document resource type is invalid.",
      400
    );
  }

  if (
    file.mimetype &&
    (
      (actualFormat === "pdf" && file.mimetype !== "application/pdf") ||
      (actualFormat !== "pdf" && !file.mimetype.startsWith("image/"))
    )
  ) {
    throw new ProfessionalVerificationError(
      "The uploaded document content does not match its declared media type.",
      400
    );
  }

  let uploadedAsset = null;

  try {
    uploadedAsset = await uploadToCloudinary(
      file.buffer,
      session
    );

    const cloudinaryFormat = normalizeFormat(uploadedAsset.format);

    if (
      uploadedAsset.public_id !== session.cloudinary_public_id ||
      uploadedAsset.resource_type !== session.resource_type ||
      cloudinaryFormat !== expectedFormat ||
      !Number.isInteger(uploadedAsset.bytes) ||
      uploadedAsset.bytes <= 0 ||
      uploadedAsset.bytes > MAX_DOCUMENT_SIZE_BYTES
    ) {
      throw new ProfessionalVerificationError(
        "Cloudinary returned an asset that does not match the upload session.",
        502
      );
    }

    const finalClient = await pool.connect();

    try {
      await finalClient.query("BEGIN");

      // Recheck everything because the application or session
      // may have changed while Cloudinary was receiving the file.
      const currentSession = await getValidUploadSession(
        finalClient,
        userId,
        applicationId,
        tokenHash
      );

      if (
        currentSession.id !== session.id ||
        currentSession.cloudinary_public_id !== uploadedAsset.public_id
      ) {
        throw new ProfessionalVerificationError(
          "The upload session changed during document processing.",
          409
        );
      }

      const consumedResult = await finalClient.query(
        `
          UPDATE professional_verification_upload_sessions
          SET consumed_at = NOW()
          WHERE id = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
          RETURNING id
        `,
        [currentSession.id]
      );

      if (consumedResult.rowCount !== 1) {
        throw new ProfessionalVerificationError(
          "Upload session has expired or has already been used.",
          409
        );
      }

      const documentResult = await finalClient.query(
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
          currentSession.document_type,
          uploadedAsset.public_id,
          uploadedAsset.resource_type,
          cloudinaryFormat,
          uploadedAsset.bytes
        ]
      );

      await finalClient.query("COMMIT");

      return {
        message: "Verification document uploaded successfully.",
        document: documentResult.rows[0]
      };
    } catch (error) {
      await finalClient.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      finalClient.release();
    }
  } catch (error) {
    // If Cloudinary accepted the file but the database operation
    // failed, remove the orphaned asset.
    if (uploadedAsset && uploadedAsset.public_id) {
      try {
        await deleteCloudinaryAsset(
          uploadedAsset.public_id,
          uploadedAsset.resource_type
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean up an unregistered verification document:",
          cleanupError.message
        );
      }
    }

    throw error;
  }
};

module.exports = {
  uploadVerificationDocument,
  detectFileFormat
};

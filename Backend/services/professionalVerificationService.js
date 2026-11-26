const { pool } = require("../config/database");


// =====================================================
// PROFESSIONAL VERIFICATION ERRORS
// =====================================================

class ProfessionalVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);

    this.name = "ProfessionalVerificationError";
    this.statusCode = statusCode;
  }
}


// =====================================================
// TRANSACTION HELPER
// =====================================================

const withTransaction = async (callback) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");

    transactionStarted = true;

    const result = await callback(client);

    await client.query("COMMIT");

    transactionStarted = false;

    return result;

  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }

    throw error;

  } finally {
    client.release();
  }
};


// =====================================================
// GET PROFESSIONAL VERIFICATION PROFILE
// =====================================================

const getProfessionalVerificationProfile = async (
  client,
  userId,
  lock = false
) => {
  const result = await client.query(
    `
      SELECT
        pp.id AS professional_profile_id,
        pp.verification_status,
        pp.verified_at,
        u.role,
        u.account_status

      FROM professional_profiles pp

      INNER JOIN users u
        ON u.id = pp.user_id

      WHERE pp.user_id = $1

      ${lock ? "FOR UPDATE OF pp" : ""}

    `,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new ProfessionalVerificationError(
      "Professional profile not found.",
      404
    );
  }

  const profile = result.rows[0];

  if (profile.role !== "professional") {
    throw new ProfessionalVerificationError(
      "Only professional accounts can submit verification applications.",
      403
    );
  }

  if (profile.account_status !== "active") {
    throw new ProfessionalVerificationError(
      "Your account is not active.",
      403
    );
  }

  return profile;
};


// =====================================================
// SUBMIT VERIFICATION APPLICATION
// =====================================================

const submitVerificationApplication = async (
  userId,
  data
) => {
  return withTransaction(async (client) => {

    const profile = await getProfessionalVerificationProfile(
      client,
      userId,
      true
    );

    if (profile.verification_status === "approved") {
      throw new ProfessionalVerificationError(
        "Your professional account has already been verified.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw new ProfessionalVerificationError(
        "You already have a pending verification application.",
        409
      );
    }

    const existingApplication = await client.query(
      `
        SELECT id, status

        FROM professional_verification_applications

        WHERE professional_profile_id = $1

        AND status = 'pending'

        LIMIT 1

      `,
      [profile.professional_profile_id]
    );

    if (existingApplication.rowCount > 0) {
      throw new ProfessionalVerificationError(
        "You already have a pending verification application.",
        409
      );
    }

    if (data.date_of_birth) {
      const birthDate = new Date(data.date_of_birth);

      if (
        Number.isNaN(birthDate.getTime()) ||
        birthDate.getTime() > Date.now()
      ) {
        throw new ProfessionalVerificationError(
          "Date of birth must be a valid past date."
        );
      }
    }

    const applicationResult = await client.query(
      `
        INSERT INTO professional_verification_applications (
          professional_profile_id,
          submitted_by,
          legal_full_name,
          date_of_birth,
          country,
          state,
          city,
          status
        )

        VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'pending'
        )

        RETURNING
          id,
          professional_profile_id,
          legal_full_name,
          date_of_birth,
          country,
          state,
          city,
          status,
          submitted_at,
          updated_at

      `,
      [
        profile.professional_profile_id,
        userId,
        data.legal_full_name,
        data.date_of_birth || null,
        data.country,
        data.state || null,
        data.city || null
      ]
    );

    await client.query(
      `
        UPDATE professional_profiles

        SET
          verification_status = 'pending',
          verified_at = NULL,
          updated_at = NOW()

        WHERE id = $1

      `,
      [profile.professional_profile_id]
    );

    return applicationResult.rows[0];
  });
};


// =====================================================
// GET MY VERIFICATION STATUS
// =====================================================

const getMyVerificationStatus = async (userId) => {

  const profile = await getProfessionalVerificationProfile(
    pool,
    userId
  );

  const applicationResult = await pool.query(
    `
      SELECT
        id,
        legal_full_name,
        date_of_birth,
        country,
        state,
        city,
        status,
        rejection_reason,
        submitted_at,
        reviewed_at,
        updated_at

      FROM professional_verification_applications

      WHERE professional_profile_id = $1

      ORDER BY submitted_at DESC

      LIMIT 1

    `,
    [profile.professional_profile_id]
  );

  const application = applicationResult.rows[0] || null;

  let documents = [];

  if (application) {
    const documentsResult = await pool.query(
      `
        SELECT
          id,
          document_type,
          file_format,
          file_size_bytes,
          uploaded_at

        FROM professional_verification_documents

        WHERE application_id = $1

        ORDER BY uploaded_at DESC

      `,
      [application.id]
    );

    documents = documentsResult.rows;
  }

  return {
    verification_status: profile.verification_status,
    verified_at: profile.verified_at,

    application,

    documents
  };
};


// =====================================================
// GET ONE VERIFICATION APPLICATION
// =====================================================

const getVerificationApplication = async (
  userId,
  applicationId
) => {

  const profile = await getProfessionalVerificationProfile(
    pool,
    userId
  );

  const applicationResult = await pool.query(
    `
      SELECT
        id,
        professional_profile_id,
        legal_full_name,
        date_of_birth,
        country,
        state,
        city,
        status,
        rejection_reason,
        submitted_at,
        reviewed_at,
        updated_at

      FROM professional_verification_applications

      WHERE id = $1

      AND professional_profile_id = $2

      LIMIT 1

    `,
    [
      applicationId,
      profile.professional_profile_id
    ]
  );

  if (applicationResult.rowCount === 0) {
    throw new ProfessionalVerificationError(
      "Verification application not found.",
      404
    );
  }

  const application = applicationResult.rows[0];

  const documentsResult = await pool.query(
    `
      SELECT
        id,
        document_type,
        file_format,
        file_size_bytes,
        uploaded_at

      FROM professional_verification_documents

      WHERE application_id = $1

      ORDER BY uploaded_at DESC

    `,
    [applicationId]
  );

  return {
    application,
    documents: documentsResult.rows
  };
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  ProfessionalVerificationError,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
};
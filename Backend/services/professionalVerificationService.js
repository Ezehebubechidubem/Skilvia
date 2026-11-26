
const { pool } = require("../config/database");

class ProfessionalVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ProfessionalVerificationError";
    this.statusCode = statusCode;
  }
}

const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

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
        pp.profile_status,
        u.id AS user_id,
        u.role,
        u.account_status
      FROM professional_profiles pp
      INNER JOIN users u
        ON u.id = pp.user_id
      WHERE u.id = $1
      ${lock ? "FOR UPDATE OF pp" : ""}
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new ProfessionalVerificationError(
      "Professional profile not found.",
      404
    );
  }

  const profile = result.rows[0];

  if (profile.role !== "professional") {
    throw new ProfessionalVerificationError(
      "Only professional accounts can access verification.",
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

// Create a new draft application.
// A new application is permitted only for first-time applicants
// or professionals whose previous verification was rejected.
const submitVerificationApplication = async (userId, data) => {
  return withTransaction(async (client) => {
    const profile = await getProfessionalVerificationProfile(
      client,
      userId,
      true
    );

    if (profile.verification_status === "approved") {
      throw new ProfessionalVerificationError(
        "Your professional verification is permanently approved. You cannot submit another application.",
        409
      );
    }

    if (profile.verification_status === "pending") {
      throw new ProfessionalVerificationError(
        "Your verification is already awaiting review.",
        409
      );
    }

    if (
      !["not_submitted", "rejected"].includes(
        profile.verification_status
      )
    ) {
      throw new ProfessionalVerificationError(
        "Your current verification status does not allow a new application.",
        409
      );
    }

    // Retrieve the most recently updated application.
    const latestApplicationResult = await client.query(
      `
        SELECT
          id,
          status
        FROM professional_verification_applications
        WHERE professional_profile_id = $1
        ORDER BY updated_at DESC, submitted_at DESC
        LIMIT 1
      `,
      [profile.professional_profile_id]
    );

    const latestApplication = latestApplicationResult.rows[0];

    if (profile.verification_status === "rejected") {
      if (
        !latestApplication ||
        latestApplication.status !== "rejected"
      ) {
        throw new ProfessionalVerificationError(
          "A new application can only be created after your previous application has been rejected.",
          409
        );
      }
    }

    if (
      profile.verification_status === "not_submitted" &&
      latestApplication
    ) {
      throw new ProfessionalVerificationError(
        "Your verification records require review before another application can be created.",
        409
      );
    }

    // Never create a second draft.
    const existingDraft = await client.query(
      `
        SELECT id
        FROM professional_verification_applications
        WHERE professional_profile_id = $1
          AND status = 'draft'
        LIMIT 1
      `,
      [profile.professional_profile_id]
    );

    if (existingDraft.rows.length > 0) {
      throw new ProfessionalVerificationError(
        "You already have a draft verification application. Continue with that application.",
        409
      );
    }

    // Never allow another application while one is pending.
    const existingPending = await client.query(
      `
        SELECT id
        FROM professional_verification_applications
        WHERE professional_profile_id = $1
          AND status = 'pending'
        LIMIT 1
      `,
      [profile.professional_profile_id]
    );

    if (existingPending.rows.length > 0) {
      throw new ProfessionalVerificationError(
        "Your verification is already awaiting review.",
        409
      );
    }

    // Insert a NEW application.
    // Previous rejected applications and their documents are preserved.
    const applicationResult = await client.query(
      `
        INSERT INTO professional_verification_applications (
          professional_profile_id,
          submitted_by,
          status,
          legal_full_name,
          date_of_birth,
          country,
          state,
          city
        )
        VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7)
        RETURNING
          id,
          status,
          legal_full_name,
          date_of_birth,
          country,
          state,
          city,
          submitted_at,
          updated_at
      `,
      [
        profile.professional_profile_id,
        userId,
        data.legal_full_name,
        data.date_of_birth || null,
        data.country || "Nigeria",
        data.state || null,
        data.city || null
      ]
    );

    return {
      message: latestApplication
        ? "A new verification draft has been created following your previous rejection."
        : "Verification draft created successfully.",
      application: applicationResult.rows[0]
    };
  });
};

const getMyVerificationStatus = async (userId) => {
  const profile = await getProfessionalVerificationProfile(
    pool,
    userId
  );

  const applicationResult = await pool.query(
    `
      SELECT
        id,
        status,
        legal_full_name,
        date_of_birth,
        country,
        state,
        city,
        reviewed_at,
        rejection_reason,
        submitted_at,
        updated_at
      FROM professional_verification_applications
      WHERE professional_profile_id = $1
      ORDER BY updated_at DESC, submitted_at DESC
      LIMIT 1
    `,
    [profile.professional_profile_id]
  );

  return {
    verification_status: profile.verification_status,
    verified_at: profile.verified_at,
    latest_application: applicationResult.rows[0] || null
  };
};

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
        status,
        legal_full_name,
        date_of_birth,
        country,
        state,
        city,
        reviewed_at,
        rejection_reason,
        submitted_at,
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

  if (applicationResult.rows.length === 0) {
    throw new ProfessionalVerificationError(
      "Verification application not found.",
      404
    );
  }

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
      ORDER BY uploaded_at ASC
    `,
    [applicationId]
  );

  return {
    application: applicationResult.rows[0],
    documents: documentsResult.rows
  };
};

module.exports = {
  ProfessionalVerificationError,
  withTransaction,
  getProfessionalVerificationProfile,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
};

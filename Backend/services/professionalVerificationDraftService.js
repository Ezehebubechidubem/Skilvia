
const { pool } = require("../config/database");

const {
  ProfessionalVerificationError,
  getProfessionalVerificationProfile
} = require("./professionalVerificationService");

const EDITABLE_FIELDS = Object.freeze([
  "legal_full_name",
  "date_of_birth",
  "country",
  "state",
  "city"
]);

const FIELD_LIMITS = Object.freeze({
  legal_full_name: 150,
  country: 100,
  state: 100,
  city: 100
});

const validateDraftData = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ProfessionalVerificationError(
      "Invalid verification details.",
      400
    );
  }

  const suppliedFields = Object.keys(data);

  if (suppliedFields.length === 0) {
    throw new ProfessionalVerificationError(
      "Provide at least one field to update.",
      400
    );
  }

  for (const field of suppliedFields) {
    if (!EDITABLE_FIELDS.includes(field)) {
      throw new ProfessionalVerificationError(
        `The field '${field}' cannot be updated.`,
        400
      );
    }
  }

  const updates = {};

  for (const field of suppliedFields) {
    const value = data[field];

    if (typeof value !== "string") {
      throw new ProfessionalVerificationError(
        `Invalid value for ${field}.`,
        400
      );
    }

    const normalizedValue = value.trim();

    if (field === "date_of_birth") {
      if (normalizedValue === "") {
        throw new ProfessionalVerificationError(
          "Date of birth cannot be empty.",
          400
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
        throw new ProfessionalVerificationError(
          "Date of birth must use YYYY-MM-DD format.",
          400
        );
      }

      const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== normalizedValue
      ) {
        throw new ProfessionalVerificationError(
          "Invalid date of birth.",
          400
        );
      }

      if (parsedDate.getTime() >= Date.now()) {
        throw new ProfessionalVerificationError(
          "Date of birth must be in the past.",
          400
        );
      }

      updates[field] = normalizedValue;
      continue;
    }

    const minimumLength = field === "legal_full_name" ? 3 : 2;
    const maximumLength = FIELD_LIMITS[field];

    if (
      normalizedValue.length < minimumLength ||
      normalizedValue.length > maximumLength
    ) {
      throw new ProfessionalVerificationError(
        `Invalid length for ${field}.`,
        400
      );
    }

    updates[field] = normalizedValue;
  }

  return updates;
};

const updateProfessionalVerificationDraft = async (
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

  const updates = validateDraftData(data);
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

    if (profile.verification_status === "approved") {
      throw new ProfessionalVerificationError(
        "Your verification has already been approved.",
        403
      );
    }

    if (profile.verification_status === "pending") {
      throw new ProfessionalVerificationError(
        "Your verification is awaiting review and cannot be edited.",
        403
      );
    }

    const applicationResult = await client.query(
      `SELECT
         id,
         professional_profile_id,
         status
       FROM professional_verification_applications
       WHERE id = $1
         AND professional_profile_id = $2
       FOR UPDATE`,
      [applicationId, profile.id]
    );

    if (applicationResult.rows.length === 0) {
      throw new ProfessionalVerificationError(
        "Verification application not found.",
        404
      );
    }

    const application = applicationResult.rows[0];

    if (application.status !== "draft") {
      throw new ProfessionalVerificationError(
        "Only draft verification applications can be edited.",
        403
      );
    }

    const assignments = [];
    const values = [applicationId];
    let parameterIndex = 2;

    for (const [field, value] of Object.entries(updates)) {
      assignments.push(`${field} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    }

    assignments.push("updated_at = NOW()");

    const updateResult = await client.query(
      `UPDATE professional_verification_applications
       SET ${assignments.join(", ")}
       WHERE id = $1
         AND professional_profile_id = $${parameterIndex}
         AND status = 'draft'
       RETURNING
         id,
         professional_profile_id,
         status,
         legal_full_name,
         date_of_birth,
         country,
         state,
         city,
         submitted_at,
         updated_at`,
      [...values, profile.id]
    );

    if (updateResult.rows.length === 0) {
      throw new ProfessionalVerificationError(
        "The draft could not be updated. Please reload and try again.",
        409
      );
    }

    await client.query("COMMIT");

    return {
      message: "Verification draft updated successfully.",
      application: updateResult.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  updateProfessionalVerificationDraft
};

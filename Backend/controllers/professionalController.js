const { pool } = require("../config/database");

// =====================================================
// PROFESSIONAL PROFILE DATABASE FIELDS
// =====================================================

const PRIVATE_PROFILE_COLUMNS = `
  id,
  business_name,
  professional_title,
  bio,
  years_of_experience,
  profile_photo_url,
  cover_photo_url,
  country,
  state,
  city,
  service_area,
  latitude,
  longitude,
  availability_status,
  profile_status,
  average_rating,
  total_reviews,
  completed_jobs,
  created_at,
  updated_at
`;

const PUBLIC_PROFILE_COLUMNS = `
  pp.id,
  u.full_name,
  pp.business_name,
  pp.professional_title,
  pp.bio,
  pp.years_of_experience,
  pp.profile_photo_url,
  pp.cover_photo_url,
  pp.country,
  pp.state,
  pp.city,
  pp.service_area,
  pp.availability_status,
  pp.average_rating,
  pp.total_reviews,
  pp.completed_jobs,
  pp.created_at
`;

const ALLOWED_UPDATE_FIELDS = new Set([
  "business_name",
  "professional_title",
  "bio",
  "years_of_experience",
  "country",
  "state",
  "city",
  "service_area",
  "latitude",
  "longitude",
  "availability_status"
]);

// =====================================================
// PROFESSIONAL ROLE CHECK
// =====================================================

const requireProfessional = (req, res) => {
  if (req.auth.role !== "professional") {
    res.status(403).json({
      success: false,
      message: "This feature is only available to professional accounts."
    });

    return false;
  }

  return true;
};

// =====================================================
// CREATE PROFESSIONAL PROFILE
// =====================================================

const createProfile = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) {
      return;
    }

    const userId = req.auth.userId;
    const data = req.validated.body;

    const result = await pool.query(
      `INSERT INTO professional_profiles (
        user_id,
        business_name,
        professional_title,
        bio,
        years_of_experience,
        country,
        state,
        city,
        service_area,
        latitude,
        longitude,
        availability_status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
      RETURNING ${PRIVATE_PROFILE_COLUMNS}`,
      [
        userId,
        data.business_name ?? null,
        data.professional_title,
        data.bio ?? null,
        data.years_of_experience ?? 0,
        data.country ?? "Nigeria",
        data.state ?? null,
        data.city ?? null,
        data.service_area ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.availability_status ?? "available"
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Your professional profile has been created.",
      profile: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A professional profile already exists for this account."
      });
    }

    return next(error);
  }
};

// =====================================================
// GET LOGGED-IN PROFESSIONAL PROFILE
// =====================================================

const getMyProfile = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) {
      return;
    }

    const result = await pool.query(
      `SELECT ${PRIVATE_PROFILE_COLUMNS}
       FROM professional_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "You have not created a professional profile yet."
      });
    }

    return res.status(200).json({
      success: true,
      profile: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================================
// UPDATE PROFESSIONAL PROFILE
// =====================================================

const updateProfile = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) {
      return;
    }

    const data = req.validated.body;

    const fields = Object.keys(data).filter(
      (field) => ALLOWED_UPDATE_FIELDS.has(field)
    );

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid profile information was provided."
      });
    }

    const values = fields.map((field) => data[field]);

    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    values.push(req.auth.userId);

    const result = await pool.query(
      `UPDATE professional_profiles
       SET ${assignments.join(", ")}
       WHERE user_id = $${values.length}
       RETURNING ${PRIVATE_PROFILE_COLUMNS}`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Create your professional profile before updating it."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Professional profile updated successfully.",
      profile: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================================
// UPDATE PROFESSIONAL AVAILABILITY
// =====================================================

const updateAvailability = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) {
      return;
    }

    const { availability_status } = req.validated.body;

    const result = await pool.query(
      `UPDATE professional_profiles
       SET availability_status = $1
       WHERE user_id = $2
       RETURNING id, availability_status`,
      [
        availability_status,
        req.auth.userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Your professional profile could not be found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your availability has been updated.",
      availability_status: result.rows[0].availability_status
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================================
// GET PUBLIC PROFESSIONAL PROFILE
// =====================================================

const getPublicProfile = async (req, res, next) => {
  try {
    const { profileId } = req.validated.params;

    const profileResult = await pool.query(
      `SELECT
        ${PUBLIC_PROFILE_COLUMNS}
       FROM professional_profiles pp
       INNER JOIN users u
         ON u.id = pp.user_id
       WHERE pp.id = $1
         AND pp.profile_status = 'published'
         AND pp.availability_status <> 'unavailable'
         AND u.role = 'professional'
         AND u.account_status = 'active'
       LIMIT 1`,
      [profileId]
    );

    if (profileResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "This professional profile is unavailable."
      });
    }

    const servicesResult = await pool.query(
      `SELECT
        ps.id,
        ps.service_title,
        ps.description,
        ps.pricing_model,
        ps.base_price,
        ps.currency,
        sc.id AS category_id,
        sc.name AS category_name,
        sc.slug AS category_slug
       FROM professional_services ps
       INNER JOIN service_categories sc
         ON sc.id = ps.category_id
       WHERE ps.professional_profile_id = $1
         AND ps.is_active = TRUE
         AND sc.is_active = TRUE
       ORDER BY
         sc.sort_order ASC,
         ps.service_title ASC`,
      [profileId]
    );

    return res.status(200).json({
      success: true,
      profile: {
        ...profileResult.rows[0],
        services: servicesResult.rows
      }
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createProfile,
  getMyProfile,
  updateProfile,
  updateAvailability,
  getPublicProfile
};
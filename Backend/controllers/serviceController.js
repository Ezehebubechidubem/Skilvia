
const { pool } = require("../config/database");


// =====================================================
// CHECK PROFESSIONAL ACCESS
// =====================================================

const requireProfessional = (req, res) => {
  if (req.auth.role !== "professional") {
    res.status(403).json({
      success: false,
      message: "Only professional accounts can manage services."
    });

    return false;
  }

  return true;
};


// =====================================================
// GET PROFESSIONAL PROFILE ID
// =====================================================

const getProfessionalProfile = async (userId) => {
  const result = await pool.query(
    `SELECT id
     FROM professional_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
};


// =====================================================
// CHECK ACTIVE SERVICE CATEGORY
// =====================================================

const categoryExists = async (categoryId) => {
  const result = await pool.query(
    `SELECT id
     FROM service_categories
     WHERE id = $1
       AND is_active = TRUE
     LIMIT 1`,
    [categoryId]
  );

  return result.rowCount > 0;
};


// =====================================================
// CREATE PROFESSIONAL SERVICE
// =====================================================

const createService = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) return;

    const userId = req.auth.userId;
    const data = req.validated.body;

    const profile = await getProfessionalProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Create your professional profile before adding services."
      });
    }

    if (!(await categoryExists(data.category_id))) {
      return res.status(400).json({
        success: false,
        message: "The selected service category is unavailable."
      });
    }

    const result = await pool.query(
      `INSERT INTO professional_services (
        professional_profile_id,
        category_id,
        service_title,
        description,
        pricing_model,
        base_price,
        currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        profile.id,
        data.category_id,
        data.service_title,
        data.description ?? null,
        data.pricing_model,
        data.base_price ?? null,
        data.currency
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Your service has been added successfully.",
      service: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "You have already added a service with this title in this category."
      });
    }

    return next(error);
  }
};


// =====================================================
// LIST MY PROFESSIONAL SERVICES
// =====================================================

const listMyServices = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) return;

    const profile = await getProfessionalProfile(req.auth.userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Your professional profile could not be found."
      });
    }

    const {
      category_id,
      is_active,
      page,
      limit
    } = req.validated.query;

    const conditions = [
      "ps.professional_profile_id = $1"
    ];

    const values = [profile.id];

    if (category_id) {
      values.push(category_id);
      conditions.push(`ps.category_id = $${values.length}`);
    }

    if (is_active !== undefined) {
      values.push(is_active === "true");
      conditions.push(`ps.is_active = $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM professional_services ps
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const offset = (page - 1) * limit;

    const listValues = [...values, limit, offset];

    const result = await pool.query(
      `SELECT
        ps.*,
        sc.name AS category_name,
        sc.slug AS category_slug
       FROM professional_services ps
       INNER JOIN service_categories sc
         ON sc.id = ps.category_id
       WHERE ${whereClause}
       ORDER BY ps.created_at DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      listValues
    );

    return res.status(200).json({
      success: true,
      services: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// GET ONE OF MY SERVICES
// =====================================================

const getMyService = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) return;

    const profile = await getProfessionalProfile(req.auth.userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Your professional profile could not be found."
      });
    }

    const { serviceId } = req.validated.params;

    const result = await pool.query(
      `SELECT
        ps.*,
        sc.name AS category_name,
        sc.slug AS category_slug
       FROM professional_services ps
       INNER JOIN service_categories sc
         ON sc.id = ps.category_id
       WHERE ps.id = $1
         AND ps.professional_profile_id = $2
       LIMIT 1`,
      [serviceId, profile.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "This service could not be found in your profile."
      });
    }

    return res.status(200).json({
      success: true,
      service: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// UPDATE PROFESSIONAL SERVICE
// =====================================================

const updateService = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) return;

    const profile = await getProfessionalProfile(req.auth.userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Your professional profile could not be found."
      });
    }

    const { serviceId } = req.validated.params;
    const data = req.validated.body;

    const existingResult = await pool.query(
      `SELECT *
       FROM professional_services
       WHERE id = $1
         AND professional_profile_id = $2
       LIMIT 1`,
      [serviceId, profile.id]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "This service could not be found in your profile."
      });
    }

    const existing = existingResult.rows[0];

    const finalPricingModel =
      data.pricing_model ?? existing.pricing_model;

    const finalBasePrice =
      Object.prototype.hasOwnProperty.call(data, "base_price")
        ? data.base_price
        : existing.base_price;

    if (
      finalPricingModel === "quote" &&
      finalBasePrice !== null &&
      finalBasePrice !== undefined &&
      Number(finalBasePrice) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A quotation service cannot have a negative price."
      });
    }

    if (
      ["fixed", "hourly"].includes(finalPricingModel) &&
      (
        finalBasePrice === null ||
        finalBasePrice === undefined ||
        !Number.isFinite(Number(finalBasePrice)) ||
        Number(finalBasePrice) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Fixed-price and hourly services require a price greater than zero."
      });
    }

    if (
      data.category_id &&
      !(await categoryExists(data.category_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected service category is unavailable."
      });
    }

    const allowedFields = [
      "category_id",
      "service_title",
      "description",
      "pricing_model",
      "base_price",
      "currency",
      "is_active"
    ];

    const fields = Object.keys(data).filter(
      (field) => allowedFields.includes(field)
    );

    const values = fields.map((field) => data[field]);

    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    values.push(serviceId, profile.id);

    const result = await pool.query(
      `UPDATE professional_services
       SET ${assignments.join(", ")}
       WHERE id = $${values.length - 1}
         AND professional_profile_id = $${values.length}
       RETURNING *`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Your service has been updated successfully.",
      service: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Another service in this category already uses that title."
      });
    }

    return next(error);
  }
};


// =====================================================
// DEACTIVATE PROFESSIONAL SERVICE
// =====================================================

const deleteService = async (req, res, next) => {
  try {
    if (!requireProfessional(req, res)) return;

    const profile = await getProfessionalProfile(req.auth.userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Your professional profile could not be found."
      });
    }

    const { serviceId } = req.validated.params;

    const result = await pool.query(
      `UPDATE professional_services
       SET is_active = FALSE
       WHERE id = $1
         AND professional_profile_id = $2
         AND is_active = TRUE
       RETURNING id`,
      [serviceId, profile.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "This active service could not be found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your service has been deactivated successfully."
    });

  } catch (error) {
    return next(error);
  }
};


module.exports = {
  createService,
  listMyServices,
  getMyService,
  updateService,
  deleteService
};

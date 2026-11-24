const { pool } = require("../config/database");

// =====================================================
// PUBLIC SERVICE DISCOVERY
// =====================================================

const discoverServices = async (req, res, next) => {
  try {
    const {
      search,
      category_id,
      state,
      city,
      pricing_model,
      page = 1,
      limit = 20
    } = req.validated.query;

    const conditions = [
      "ps.is_active = TRUE",
      "sc.is_active = TRUE",
      "pp.profile_status = 'published'",
      "pp.availability_status <> 'unavailable'",
      "u.role = 'professional'",
      "u.account_status = 'active'"
    ];

    const values = [];

    if (search) {
      values.push(`%${search}%`);

      conditions.push(
        `(ps.service_title ILIKE $${values.length}
          OR ps.description ILIKE $${values.length}
          OR pp.business_name ILIKE $${values.length}
          OR pp.professional_title ILIKE $${values.length})`
      );
    }

    if (category_id) {
      values.push(category_id);
      conditions.push(`sc.id = $${values.length}`);
    }

    if (state) {
      values.push(state);
      conditions.push(`pp.state ILIKE $${values.length}`);
    }

    if (city) {
      values.push(city);
      conditions.push(`pp.city ILIKE $${values.length}`);
    }

    if (pricing_model) {
      values.push(pricing_model);
      conditions.push(`ps.pricing_model = $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    // =====================================
    // TOTAL MATCHING SERVICES
    // =====================================

    const countResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM professional_services ps
       INNER JOIN professional_profiles pp
         ON pp.id = ps.professional_profile_id
       INNER JOIN users u
         ON u.id = pp.user_id
       INNER JOIN service_categories sc
         ON sc.id = ps.category_id
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;

    const offset = (page - 1) * limit;

    // =====================================
    // FETCH PUBLIC SERVICES
    // =====================================

    const listValues = [
      ...values,
      limit,
      offset
    ];

    const result = await pool.query(
      `SELECT
        ps.id AS service_id,
        ps.service_title,
        ps.description AS service_description,
        ps.pricing_model,
        ps.base_price,
        ps.currency,
        ps.created_at AS service_created_at,

        sc.id AS category_id,
        sc.name AS category_name,
        sc.slug AS category_slug,
        sc.icon AS category_icon,

        pp.id AS professional_profile_id,
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
        pp.completed_jobs

       FROM professional_services ps

       INNER JOIN professional_profiles pp
         ON pp.id = ps.professional_profile_id

       INNER JOIN users u
         ON u.id = pp.user_id

       INNER JOIN service_categories sc
         ON sc.id = ps.category_id

       WHERE ${whereClause}

       ORDER BY
        pp.average_rating DESC,
        pp.total_reviews DESC,
        ps.created_at DESC

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
// GET ONE PUBLIC SERVICE
// =====================================================

const getPublicServiceById = async (req, res, next) => {
  try {
    const { serviceId } = req.validated.params;

    const result = await pool.query(
      `SELECT
        ps.id AS service_id,
        ps.service_title,
        ps.description AS service_description,
        ps.pricing_model,
        ps.base_price,
        ps.currency,
        ps.created_at AS service_created_at,

        sc.id AS category_id,
        sc.name AS category_name,
        sc.slug AS category_slug,
        sc.icon AS category_icon,

        pp.id AS professional_profile_id,
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
        pp.completed_jobs

       FROM professional_services ps

       INNER JOIN professional_profiles pp
         ON pp.id = ps.professional_profile_id

       INNER JOIN users u
         ON u.id = pp.user_id

       INNER JOIN service_categories sc
         ON sc.id = ps.category_id

       WHERE ps.id = $1
         AND ps.is_active = TRUE
         AND sc.is_active = TRUE
         AND pp.profile_status = 'published'
         AND pp.availability_status <> 'unavailable'
         AND u.role = 'professional'
         AND u.account_status = 'active'

       LIMIT 1`,
      [serviceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "The requested service is unavailable."
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
// EXPORTS
// =====================================================

module.exports = {
  discoverServices,
  getPublicServiceById
};
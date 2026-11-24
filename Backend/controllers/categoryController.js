
const { pool } = require("../config/database");


// =====================================================
// GET ALL ACTIVE SERVICE CATEGORIES
// =====================================================

const getCategories = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        sc.id,
        sc.name,
        sc.slug,
        sc.description,
        sc.icon,
        sc.parent_id,
        sc.sort_order,
        COUNT(DISTINCT ps.professional_profile_id)
          FILTER (
            WHERE ps.is_active = TRUE
              AND pp.profile_status = 'published'
              AND pp.availability_status <> 'unavailable'
          )::INTEGER AS active_professionals
       FROM service_categories sc
       LEFT JOIN professional_services ps
         ON ps.category_id = sc.id
       LEFT JOIN professional_profiles pp
         ON pp.id = ps.professional_profile_id
       WHERE sc.is_active = TRUE
       GROUP BY
        sc.id,
        sc.name,
        sc.slug,
        sc.description,
        sc.icon,
        sc.parent_id,
        sc.sort_order
       ORDER BY
        sc.sort_order ASC,
        sc.name ASC`
    );

    return res.status(200).json({
      success: true,
      totalCategories: result.rowCount,
      categories: result.rows
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// GET ONE CATEGORY BY ID
// =====================================================

const getCategoryById = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const result = await pool.query(
      `SELECT
        sc.id,
        sc.name,
        sc.slug,
        sc.description,
        sc.icon,
        sc.parent_id,
        sc.sort_order,
        COUNT(DISTINCT ps.professional_profile_id)
          FILTER (
            WHERE ps.is_active = TRUE
              AND pp.profile_status = 'published'
              AND pp.availability_status <> 'unavailable'
          )::INTEGER AS active_professionals
       FROM service_categories sc
       LEFT JOIN professional_services ps
         ON ps.category_id = sc.id
       LEFT JOIN professional_profiles pp
         ON pp.id = ps.professional_profile_id
       WHERE sc.id = $1
         AND sc.is_active = TRUE
       GROUP BY
        sc.id,
        sc.name,
        sc.slug,
        sc.description,
        sc.icon,
        sc.parent_id,
        sc.sort_order
       LIMIT 1`,
      [categoryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "The requested service category was not found."
      });
    }

    return res.status(200).json({
      success: true,
      category: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// GET CATEGORY SUBCATEGORIES
// =====================================================

const getSubcategories = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const parentResult = await pool.query(
      `SELECT id, name
       FROM service_categories
       WHERE id = $1
         AND is_active = TRUE
       LIMIT 1`,
      [categoryId]
    );

    if (parentResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "The requested parent category was not found."
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        name,
        slug,
        description,
        icon,
        parent_id,
        sort_order
       FROM service_categories
       WHERE parent_id = $1
         AND is_active = TRUE
       ORDER BY sort_order ASC, name ASC`,
      [categoryId]
    );

    return res.status(200).json({
      success: true,
      parentCategory: parentResult.rows[0],
      totalSubcategories: result.rowCount,
      subcategories: result.rows
    });

  } catch (error) {
    return next(error);
  }
};


module.exports = {
  getCategories,
  getCategoryById,
  getSubcategories
};

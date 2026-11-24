
const { pool } = require("../config/database");


// =====================================================
// ADMIN ACCESS CHECK
// =====================================================

const requireAdmin = (req, res) => {
  if (!req.auth || req.auth.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Administrator access is required."
    });

    return false;
  }

  return true;
};


// =====================================================
// VALIDATE PARENT CATEGORY
// PREVENTS INVALID CATEGORY HIERARCHIES
// =====================================================

const validateParentCategory = async (
  parentId,
  currentCategoryId = null
) => {
  if (!parentId) return true;

  if (currentCategoryId && parentId === currentCategoryId) {
    return false;
  }

  const parentResult = await pool.query(
    `SELECT id
     FROM service_categories
     WHERE id = $1
       AND is_active = TRUE
     LIMIT 1`,
    [parentId]
  );

  if (parentResult.rowCount === 0) {
    return false;
  }

  if (currentCategoryId) {
    const descendantsResult = await pool.query(
      `WITH RECURSIVE descendants AS (
        SELECT id
        FROM service_categories
        WHERE parent_id = $1

        UNION

        SELECT sc.id
        FROM service_categories sc
        INNER JOIN descendants d
          ON sc.parent_id = d.id
      )
      SELECT id
      FROM descendants
      WHERE id = $2
      LIMIT 1`,
      [currentCategoryId, parentId]
    );

    if (descendantsResult.rowCount > 0) {
      return false;
    }
  }

  return true;
};


// =====================================================
// CREATE CATEGORY OR SUBCATEGORY
// =====================================================

const createCategory = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const data = req.validated.body;

    if (
      data.parent_id &&
      !(await validateParentCategory(data.parent_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected parent category is invalid or inactive."
      });
    }

    const result = await pool.query(
      `INSERT INTO service_categories (
        name,
        slug,
        description,
        icon,
        parent_id,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        data.name,
        data.slug,
        data.description ?? null,
        data.icon ?? null,
        data.parent_id ?? null,
        data.sort_order ?? 0
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this slug already exists."
      });
    }

    return next(error);
  }
};


// =====================================================
// GET ALL CATEGORIES FOR ADMIN
// INCLUDES ACTIVE AND INACTIVE CATEGORIES
// =====================================================

const getAllCategories = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const result = await pool.query(
      `SELECT
        sc.*,
        parent.name AS parent_name,
        COUNT(DISTINCT ps.id)::INTEGER AS total_services,
        COUNT(DISTINCT ps.id)
          FILTER (WHERE ps.is_active = TRUE)::INTEGER
          AS active_services
       FROM service_categories sc
       LEFT JOIN service_categories parent
         ON parent.id = sc.parent_id
       LEFT JOIN professional_services ps
         ON ps.category_id = sc.id
       GROUP BY sc.id, parent.name
       ORDER BY
         sc.parent_id NULLS FIRST,
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
// GET ONE CATEGORY FOR ADMIN
// =====================================================

const getCategoryById = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { categoryId } = req.validated.params;

    const result = await pool.query(
      `SELECT
        sc.*,
        parent.name AS parent_name,
        COUNT(DISTINCT ps.id)::INTEGER AS total_services
       FROM service_categories sc
       LEFT JOIN service_categories parent
         ON parent.id = sc.parent_id
       LEFT JOIN professional_services ps
         ON ps.category_id = sc.id
       WHERE sc.id = $1
       GROUP BY sc.id, parent.name
       LIMIT 1`,
      [categoryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found."
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
// UPDATE CATEGORY
// =====================================================

const updateCategory = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { categoryId } = req.validated.params;
    const data = req.validated.body;

    const existingResult = await pool.query(
      `SELECT *
       FROM service_categories
       WHERE id = $1
       LIMIT 1`,
      [categoryId]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(data, "parent_id") &&
      data.parent_id !== null
    ) {
      const validParent = await validateParentCategory(
        data.parent_id,
        categoryId
      );

      if (!validParent) {
        return res.status(400).json({
          success: false,
          message: "The selected parent category is invalid or would create a category hierarchy cycle."
        });
      }
    }

    const allowedFields = [
      "name",
      "slug",
      "description",
      "icon",
      "parent_id",
      "sort_order",
      "is_active"
    ];

    const fields = Object.keys(data).filter(
      (field) => allowedFields.includes(field)
    );

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid category information was provided."
      });
    }

    const values = fields.map((field) => data[field]);

    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    values.push(categoryId);

    const result = await pool.query(
      `UPDATE service_categories
       SET ${assignments.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category: result.rows[0]
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this slug already exists."
      });
    }

    return next(error);
  }
};


// =====================================================
// ACTIVATE OR DEACTIVATE CATEGORY
// =====================================================

const updateCategoryStatus = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { categoryId } = req.validated.params;
    const { is_active } = req.validated.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const categoryResult = await client.query(
        `SELECT id
         FROM service_categories
         WHERE id = $1
         FOR UPDATE`,
        [categoryId]
      );

      if (categoryResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Category not found."
        });
      }

      if (!is_active) {
        const childResult = await client.query(
          `SELECT id
           FROM service_categories
           WHERE parent_id = $1
             AND is_active = TRUE
           LIMIT 1`,
          [categoryId]
        );

        if (childResult.rowCount > 0) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            message: "Deactivate or move the active subcategories before deactivating this parent category."
          });
        }
      }

      const result = await client.query(
        `UPDATE service_categories
         SET is_active = $1
         WHERE id = $2
         RETURNING *`,
        [is_active, categoryId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: is_active
          ? "Category activated successfully."
          : "Category deactivated successfully.",
        category: result.rows[0]
      });

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    return next(error);
  }
};


// =====================================================
// EXPORT CONTROLLER FUNCTIONS
// =====================================================

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  updateCategoryStatus
};

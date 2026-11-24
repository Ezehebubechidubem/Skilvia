
const { pool } = require("../config/database");

const {
  recordAdminAudit
} = require("../services/adminAuditService");


// =====================================================
// RECORD ADMIN ACTION
// =====================================================

const auditAdminAction = async (
  req,
  client,
  action,
  entityId,
  beforeData,
  afterData
) => {
  return recordAdminAudit(
    {
      actorUserId: req.auth.userId,
      action,
      entityType: "service_category",
      entityId: String(entityId),
      beforeData,
      afterData,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      requestId: req.id || null
    },
    client
  );
};


// =====================================================
// TRANSACTION ROLLBACK HELPER
// =====================================================

const rollbackTransaction = async (client) => {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    error.message = `Transaction rollback failed: ${error.message}`;
    throw error;
  }
};


// =====================================================
// VALIDATE PARENT CATEGORY
// =====================================================

const validateParentCategory = async (
  client,
  parentId,
  currentCategoryId = null
) => {
  if (!parentId) {
    return true;
  }

  if (
    currentCategoryId &&
    parentId === currentCategoryId
  ) {
    return false;
  }

  const parentResult = await client.query(
    `
      SELECT id
      FROM service_categories
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [parentId]
  );

  if (parentResult.rowCount === 0) {
    return false;
  }

  if (currentCategoryId) {
    const descendantsResult = await client.query(
      `
        WITH RECURSIVE descendants AS (
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
        LIMIT 1
      `,
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
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const data = req.validated.body;

    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize category hierarchy changes.
    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [78124001]
    );

    if (
      data.parent_id &&
      !(await validateParentCategory(
        client,
        data.parent_id
      ))
    ) {
      await rollbackTransaction(client);
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "The selected parent category is invalid or inactive."
      });
    }

    const result = await client.query(
      `
        INSERT INTO service_categories (
          name,
          slug,
          description,
          icon,
          parent_id,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        data.name,
        data.slug,
        data.description ?? null,
        data.icon ?? null,
        data.parent_id ?? null,
        data.sort_order ?? 0
      ]
    );

    const category = result.rows[0];

    await auditAdminAction(
      req,
      client,
      "category_created",
      category.id,
      null,
      category
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await rollbackTransaction(client);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this slug already exists."
      });
    }

    return next(error);

  } finally {
    client.release();
  }
};


// =====================================================
// GET ALL CATEGORIES
// =====================================================

const getAllCategories = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
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
          sc.name ASC
      `
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
// GET ONE CATEGORY
// =====================================================

const getCategoryById = async (req, res, next) => {
  try {
    const { categoryId } = req.validated.params;

    const result = await pool.query(
      `
        SELECT
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
        WHERE sc.id = $1
        GROUP BY sc.id, parent.name
        LIMIT 1
      `,
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
// UPDATE CATEGORY DETAILS
// =====================================================

const updateCategory = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { categoryId } = req.validated.params;
    const data = req.validated.body;

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [78124001]
    );

    const existingResult = await client.query(
      `
        SELECT *
        FROM service_categories
        WHERE id = $1
        FOR UPDATE
      `,
      [categoryId]
    );

    if (existingResult.rowCount === 0) {
      await rollbackTransaction(client);
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    const existing = existingResult.rows[0];

    if (
      Object.prototype.hasOwnProperty.call(
        data,
        "parent_id"
      ) &&
      data.parent_id !== null
    ) {
      const validParent = await validateParentCategory(
        client,
        data.parent_id,
        categoryId
      );

      if (!validParent) {
        await rollbackTransaction(client);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The selected parent category is invalid or would create a category hierarchy cycle."
        });
      }
    }

    // Only category details can be changed here.
    // is_active is deliberately excluded.
    const allowedFields = [
      "name",
      "slug",
      "description",
      "icon",
      "parent_id",
      "sort_order"
    ];

    const fields = Object.keys(data).filter(
      field => allowedFields.includes(field)
    );

    if (fields.length === 0) {
      await rollbackTransaction(client);
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "No valid category information was provided."
      });
    }

    const values = fields.map(field => data[field]);

    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );

    values.push(categoryId);

    const result = await client.query(
      `
        UPDATE service_categories
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    const updatedCategory = result.rows[0];

    await auditAdminAction(
      req,
      client,
      "category_updated",
      categoryId,
      existing,
      updatedCategory
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category: updatedCategory
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await rollbackTransaction(client);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A category with this slug already exists."
      });
    }

    return next(error);

  } finally {
    client.release();
  }
};


// =====================================================
// ACTIVATE OR DEACTIVATE CATEGORY
// =====================================================

const updateCategoryStatus = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { categoryId } = req.validated.params;
    const { is_active } = req.validated.body;

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [78124001]
    );

    const categoryResult = await client.query(
      `
        SELECT *
        FROM service_categories
        WHERE id = $1
        FOR UPDATE
      `,
      [categoryId]
    );

    if (categoryResult.rowCount === 0) {
      await rollbackTransaction(client);
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    const existing = categoryResult.rows[0];

    if (existing.is_active === is_active) {
      await rollbackTransaction(client);
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: is_active
          ? "This category is already active."
          : "This category is already inactive."
      });
    }

    if (!is_active) {
      const childResult = await client.query(
        `
          SELECT id
          FROM service_categories
          WHERE parent_id = $1
            AND is_active = TRUE
          LIMIT 1
        `,
        [categoryId]
      );

      if (childResult.rowCount > 0) {
        await rollbackTransaction(client);
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: "Deactivate or move the active subcategories before deactivating this parent category."
        });
      }
    }

    const result = await client.query(
      `
        UPDATE service_categories
        SET is_active = $1
        WHERE id = $2
        RETURNING *
      `,
      [is_active, categoryId]
    );

    const updatedCategory = result.rows[0];

    await auditAdminAction(
      req,
      client,
      is_active
        ? "category_activated"
        : "category_deactivated",
      categoryId,
      existing,
      updatedCategory
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: is_active
        ? "Category activated successfully."
        : "Category deactivated successfully.",
      category: updatedCategory
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await rollbackTransaction(client);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }

    return next(error);

  } finally {
    client.release();
  }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  updateCategoryStatus
};

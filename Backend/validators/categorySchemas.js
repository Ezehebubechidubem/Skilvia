const { z } = require("zod");

// =====================================================
// COMMON REQUEST SCHEMA
// =====================================================

const requestSchema = (querySchema = z.object({}).strict(), paramsSchema = z.object({}).strict()) =>
  z.object({
    body: z.object({}).strict(),
    params: paramsSchema,
    query: querySchema
  }).strict();

// =====================================================
// CATEGORY ID VALIDATION
// =====================================================

const categoryIdParamsSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID.")
}).strict();

// =====================================================
// GET ALL CATEGORIES
// =====================================================

const getCategoriesSchema = requestSchema();

// =====================================================
// GET CATEGORY BY ID
// =====================================================

const getCategoryByIdSchema = requestSchema(
  z.object({}).strict(),
  categoryIdParamsSchema
);

// =====================================================
// GET SUBCATEGORIES
// =====================================================

const getSubcategoriesSchema = requestSchema(
  z.object({}).strict(),
  categoryIdParamsSchema
);

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getCategoriesSchema,
  getCategoryByIdSchema,
  getSubcategoriesSchema
};
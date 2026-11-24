
const { z } = require("zod");


// =====================================================
// COMMON REQUEST SCHEMA
// =====================================================

const requestSchema = (
  bodySchema,
  paramsSchema = z.object({}).strict()
) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: z.object({}).strict()
  });


// =====================================================
// CATEGORY ID PARAMETERS
// =====================================================

const categoryIdParamsSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID.")
}).strict();


// =====================================================
// CATEGORY FIELDS
// =====================================================

const categoryFields = {
  name: z.string()
    .trim()
    .min(2)
    .max(100),

  slug: z.string()
    .trim()
    .min(2)
    .max(120)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Slug must contain lowercase letters, numbers and hyphens only."
    ),

  description: z.string()
    .trim()
    .max(2000)
    .nullable()
    .optional(),

  icon: z.string()
    .trim()
    .max(100)
    .nullable()
    .optional(),

  parent_id: z.string()
    .uuid()
    .nullable()
    .optional(),

  sort_order: z.coerce.number()
    .int()
    .min(0)
    .max(100000)
    .optional()
};


// =====================================================
// CREATE CATEGORY
// =====================================================

const createCategorySchema = requestSchema(
  z.object({
    ...categoryFields
  }).strict()
);


// =====================================================
// UPDATE CATEGORY
// =====================================================

const updateCategorySchema = requestSchema(
  z.object({
    name: categoryFields.name.optional(),

    slug: categoryFields.slug.optional(),

    description: categoryFields.description,

    icon: categoryFields.icon,

    parent_id: categoryFields.parent_id,

    sort_order: categoryFields.sort_order
  })
    .strict()
    .refine(
      data => Object.keys(data).length > 0,
      {
        message: "Provide at least one category field to update."
      }
    ),
  categoryIdParamsSchema
);


// =====================================================
// ACTIVATE / DEACTIVATE CATEGORY
// =====================================================

const updateCategoryStatusSchema = requestSchema(
  z.object({
    is_active: z.boolean()
  }).strict(),
  categoryIdParamsSchema
);


// =====================================================
// DELETE CATEGORY REQUEST
// =====================================================

const deleteCategorySchema = requestSchema(
  z.object({}).strict(),
  categoryIdParamsSchema
);


// =====================================================
// EXPORT VALIDATORS
// =====================================================

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  deleteCategorySchema,
  categoryIdParamsSchema
};

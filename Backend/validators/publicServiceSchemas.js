const { z } = require("zod");

// =====================================================
// COMMON REQUEST SCHEMA
// =====================================================

const emptyObjectSchema = z.object({}).strict();

const requestSchema = (
  querySchema = emptyObjectSchema,
  paramsSchema = emptyObjectSchema
) => {
  return z.object({
    body: emptyObjectSchema,
    params: paramsSchema,
    query: querySchema
  }).strict();
};

// =====================================================
// SERVICE ID VALIDATION
// =====================================================

const serviceIdParamsSchema = z.object({
  serviceId: z.string().uuid("Invalid service ID.")
}).strict();

// =====================================================
// PUBLIC SERVICE DISCOVERY QUERY
// =====================================================

const discoverServicesQuerySchema = z.object({
  search: z.string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  category_id: z.string()
    .uuid("Invalid category ID.")
    .optional(),

  state: z.string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  city: z.string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  pricing_model: z.enum([
    "fixed",
    "hourly",
    "quote"
  ]).optional(),

  page: z.coerce.number()
    .int()
    .min(1)
    .max(1000000)
    .default(1),

  limit: z.coerce.number()
    .int()
    .min(1)
    .max(50)
    .default(20)

}).strict();

// =====================================================
// DISCOVER PUBLIC SERVICES
// =====================================================

const discoverServicesSchema = requestSchema(
  discoverServicesQuerySchema
);

// =====================================================
// GET ONE PUBLIC SERVICE
// =====================================================

const getPublicServiceByIdSchema = requestSchema(
  emptyObjectSchema,
  serviceIdParamsSchema
);

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  discoverServicesSchema,
  getPublicServiceByIdSchema
};
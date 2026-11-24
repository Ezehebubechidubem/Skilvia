
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
    query: z.unknown()
  });


// =====================================================
// SERVICE ID PARAMETERS
// =====================================================

const serviceIdParamsSchema = z.object({
  serviceId: z.string().uuid("Invalid service ID.")
}).strict();


// =====================================================
// CREATE SERVICE VALIDATION
// =====================================================

const createServiceBodySchema = z.discriminatedUnion(
  "pricing_model",
  [
    z.object({
      category_id: z.string().uuid(),

      service_title: z.string().trim().min(2).max(150),

      description: z.string().trim().max(3000).nullable().optional(),

      pricing_model: z.literal("fixed"),

      base_price: z.coerce.number().positive().max(999999999999),

      currency: z.string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN")
    }).strict(),

    z.object({
      category_id: z.string().uuid(),

      service_title: z.string().trim().min(2).max(150),

      description: z.string().trim().max(3000).nullable().optional(),

      pricing_model: z.literal("hourly"),

      base_price: z.coerce.number().positive().max(999999999999),

      currency: z.string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN")
    }).strict(),

    z.object({
      category_id: z.string().uuid(),

      service_title: z.string().trim().min(2).max(150),

      description: z.string().trim().max(3000).nullable().optional(),

      pricing_model: z.literal("quote"),

      base_price: z.coerce.number()
        .nonnegative()
        .max(999999999999)
        .nullable()
        .optional(),

      currency: z.string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN")
    }).strict()
  ]
);

const createServiceSchema = requestSchema(
  createServiceBodySchema
);


// =====================================================
// UPDATE SERVICE VALIDATION
// =====================================================

const updateServiceBodySchema = z.object({
  category_id: z.string().uuid().optional(),

  service_title: z.string().trim().min(2).max(150).optional(),

  description: z.string().trim().max(3000).nullable().optional(),

  pricing_model: z.enum([
    "fixed",
    "hourly",
    "quote"
  ]).optional(),

  base_price: z.coerce.number()
    .nonnegative()
    .max(999999999999)
    .nullable()
    .optional(),

  currency: z.string()
    .regex(/^[A-Z]{3}$/)
    .optional(),

  is_active: z.boolean().optional()
})
.strict()
.refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "Provide at least one service field to update."
  }
);

const updateServiceSchema = requestSchema(
  updateServiceBodySchema,
  serviceIdParamsSchema
);


// =====================================================
// GET / DELETE SERVICE VALIDATION
// =====================================================

const getServiceSchema = requestSchema(
  z.object({}).strict(),
  serviceIdParamsSchema
);

const deleteServiceSchema = getServiceSchema;


// =====================================================
// LIST PROFESSIONAL SERVICES VALIDATION
// =====================================================

const listServicesQuerySchema = z.object({
  category_id: z.string().uuid().optional(),

  is_active: z.enum(["true", "false"]).optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();

const listServicesSchema = z.object({
  body: z.object({}).strict(),
  params: z.object({}).strict(),
  query: listServicesQuerySchema
});


module.exports = {
  createServiceSchema,
  updateServiceSchema,
  getServiceSchema,
  deleteServiceSchema,
  listServicesSchema,
  serviceIdParamsSchema
};

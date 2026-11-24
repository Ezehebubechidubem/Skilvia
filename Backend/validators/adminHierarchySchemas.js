
const { z } = require("zod");


// =====================================================
// REQUEST SCHEMA HELPER
// =====================================================

const requestSchema = (
  bodySchema = z.object({}).strict(),
  paramsSchema = z.object({}).strict(),
  querySchema = z.object({}).strict()
) => {
  return z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  });
};


// =====================================================
// COMMON VALIDATION
// =====================================================

const uuidSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();

const accountStatusSchema = z.enum([
  "active",
  "suspended",
  "deactivated"
]);


// =====================================================
// LIST ADMINISTRATORS
// =====================================================

const listAdministratorsSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    admin_type: z.enum([
      "super_admin",
      "sub_admin"
    ]).optional(),
    account_status: accountStatusSchema.optional()
  }).strict()
);


// =====================================================
// CREATE SUB-ADMINISTRATOR
// =====================================================

const createSubAdminSchema = requestSchema(
  z.object({
    full_name: z.string()
      .trim()
      .min(2)
      .max(120),

    email: z.string()
      .trim()
      .email()
      .max(254)
      .transform(value => value.toLowerCase()),

    phone: z.string()
      .trim()
      .min(7)
      .max(20),

    password: z.string()
      .min(12)
      .refine(
        password => Buffer.byteLength(password, "utf8") <= 72,
        "Password must not exceed 72 bytes."
      )
  }).strict()
);


// =====================================================
// UPDATE SUB-ADMINISTRATOR STATUS
// =====================================================

const updateSubAdminStatusSchema = requestSchema(
  z.object({
    account_status: accountStatusSchema
  }).strict(),
  z.object({
    adminId: uuidSchema
  }).strict()
);


// =====================================================
// GET ADMINISTRATOR DETAILS
// =====================================================

const getAdministratorSchema = requestSchema(
  z.object({}).strict(),
  z.object({
    adminId: uuidSchema
  }).strict()
);


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  listAdministratorsSchema,
  createSubAdminSchema,
  updateSubAdminStatusSchema,
  getAdministratorSchema
};

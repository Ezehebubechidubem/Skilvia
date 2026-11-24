
const { z } = require("zod");

const requestSchema = (
  bodySchema = z.object({}).strict(),
  paramsSchema = z.object({}).strict(),
  querySchema = z.object({}).strict()
) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  });

const uuidSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30)
}).strict();


// =====================================================
// LIST ADMINISTRATORS
// =====================================================

const listAdministratorsSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  paginationSchema.extend({
    search: z.string().trim().min(1).max(100).optional(),
    admin_type: z.enum(["super_admin", "sub_admin"]).optional(),
    account_status: z.enum([
      "active",
      "suspended",
      "deactivated"
    ]).optional()
  }).strict()
);


// =====================================================
// CREATE SUB-ADMINISTRATOR
// =====================================================

const createSubAdminSchema = requestSchema(
  z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform(
      (value) => value.toLowerCase()
    ),
    phone: z.string().trim().min(7).max(20),
    password: z.string().min(12).max(128)
  }).strict()
);


// =====================================================
// ADMINISTRATOR ID
// =====================================================

const adminIdParamsSchema = z.object({
  adminId: uuidSchema
}).strict();


// =====================================================
// UPDATE SUB-ADMIN ACCOUNT STATUS
// =====================================================

const updateSubAdminStatusSchema = requestSchema(
  z.object({
    account_status: z.enum(["active", "suspended", "deactivated"])
  }).strict(),
  adminIdParamsSchema
);


// =====================================================
// GET ADMINISTRATOR DETAILS
// =====================================================

const getAdministratorSchema = requestSchema(
  z.object({}).strict(),
  adminIdParamsSchema
);


module.exports = {
  listAdministratorsSchema,
  createSubAdminSchema,
  updateSubAdminStatusSchema,
  getAdministratorSchema
};

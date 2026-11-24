
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

const permissionKeySchema = z.string()
  .trim()
  .min(5)
  .max(150)
  .regex(
    /^admin\.[a-z0-9_.]+$/,
    "Invalid administrator permission key."
  );

const paginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .min(1)
    .max(1000000)
    .default(1),

  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(30)
}).strict();

const adminIdParamsSchema = z.object({
  adminId: uuidSchema
}).strict();

const permissionAssignmentParamsSchema = z.object({
  adminId: uuidSchema,
  permissionKey: permissionKeySchema
}).strict();

const listAdminPermissionsSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  paginationSchema.extend({
    search: z.string().trim().min(1).max(100).optional()
  })
);

const listPermissionCatalogueSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  paginationSchema.extend({
    category: z.string().trim().min(2).max(100).optional(),
    active_only: z.enum(["true", "false"]).optional()
  })
);

const getAdminPermissionAssignmentsSchema = requestSchema(
  z.object({}).strict(),
  adminIdParamsSchema
);

const grantAdminPermissionSchema = requestSchema(
  z.object({
    permission_key: permissionKeySchema,

    expires_at: z.string()
      .datetime({ offset: true })
      .nullable()
      .optional()
  }).strict(),
  adminIdParamsSchema
);

const updateAdminPermissionSchema = requestSchema(
  z.object({
    expires_at: z.string()
      .datetime({ offset: true })
      .nullable()
  }).strict(),
  permissionAssignmentParamsSchema
);

const revokeAdminPermissionSchema = requestSchema(
  z.object({}).strict(),
  permissionAssignmentParamsSchema
);

module.exports = {
  permissionKeySchema,
  listAdminPermissionsSchema,
  listPermissionCatalogueSchema,
  getAdminPermissionAssignmentsSchema,
  grantAdminPermissionSchema,
  updateAdminPermissionSchema,
  revokeAdminPermissionSchema
};

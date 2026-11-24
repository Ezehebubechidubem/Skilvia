
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


// =====================================================
// COMMON VALIDATION
// =====================================================

const uuidSchema = z.string().uuid();

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


// =====================================================
// LIST ADMIN AUDIT LOGS
// =====================================================

const auditLogQuerySchema = paginationSchema.extend({
  actor_user_id: uuidSchema.optional(),

  action: z.string()
    .trim()
    .min(1)
    .max(150)
    .optional(),

  entity_type: z.string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  entity_id: z.string()
    .trim()
    .min(1)
    .max(150)
    .optional(),

  start_date: z.string()
    .datetime({ offset: true })
    .optional(),

  end_date: z.string()
    .datetime({ offset: true })
    .optional()
}).strict().superRefine((data, context) => {
  if (
    data.start_date &&
    data.end_date &&
    new Date(data.start_date) > new Date(data.end_date)
  ) {
    context.addIssue({
      code: "custom",
      path: ["end_date"],
      message: "End date cannot be earlier than start date."
    });
  }
});

const getAdminAuditLogSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  auditLogQuerySchema
);


// =====================================================
// GET ONE AUDIT LOG
// =====================================================

const getAdminAuditLogByIdSchema = requestSchema(
  z.object({}).strict(),

  z.object({
    auditLogId: uuidSchema
  }).strict(),

  z.object({}).strict()
);


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getAdminAuditLogSchema,
  getAdminAuditLogByIdSchema
};

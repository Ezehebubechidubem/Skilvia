
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
// LIST ADMIN AUDIT LOGS
// =====================================================

const getAdminAuditLogsSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  z.object({
    actor_user_id: z.string().uuid().optional(),

    action: z.string()
      .trim()
      .min(2)
      .max(100)
      .optional(),

    entity_type: z.string()
      .trim()
      .min(2)
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
      .optional(),

    page: z.coerce.number()
      .int()
      .min(1)
      .max(1000000)
      .default(1),

    limit: z.coerce.number()
      .int()
      .min(1)
      .max(100)
      .default(20)
  }).strict().refine(
    (data) => {
      if (!data.start_date || !data.end_date) {
        return true;
      }

      return (
        new Date(data.start_date).getTime() <=
        new Date(data.end_date).getTime()
      );
    },
    {
      message: "Start date must not be later than end date.",
      path: ["end_date"]
    }
  )
);


// =====================================================
// GET ONE AUDIT RECORD
// =====================================================

const auditLogIdParamsSchema = z.object({
  auditLogId: z.string().uuid(
    "Invalid audit log ID."
  )
}).strict();

const getAdminAuditLogSchema = requestSchema(
  z.object({}).strict(),
  auditLogIdParamsSchema
);


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  getAdminAuditLogsSchema,
  getAdminAuditLogSchema
};

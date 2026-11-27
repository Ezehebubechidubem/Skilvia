
const { z } = require("zod");

const emptyObjectSchema = z.object({}).strict();

const uuidSchema = z.string().uuid(
  "Invalid verification application ID."
);

const requestSchema = (
  bodySchema = emptyObjectSchema,
  paramsSchema = emptyObjectSchema,
  querySchema = emptyObjectSchema
) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  }).strict();

const reviewProfessionalVerificationSchema = requestSchema(
  z.object({
    decision: z.enum(["approved", "rejected"]),

    rejection_reason: z.string()
      .trim()
      .min(1)
      .max(2000)
      .optional(),

    admin_notes: z.string()
      .trim()
      .max(5000)
      .nullable()
      .optional()
  })
    .strict()
    .superRefine((data, context) => {
      if (
        data.decision === "rejected" &&
        !data.rejection_reason
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejection_reason"],
          message: "A rejection reason is required."
        });
      }

      if (
        data.decision === "approved" &&
        data.rejection_reason
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejection_reason"],
          message: "A rejection reason must not be provided when approving an application."
        });
      }
    }),

  z.object({
    applicationId: uuidSchema
  }).strict()
);

const getPendingProfessionalVerificationsSchema = requestSchema(
  emptyObjectSchema,
  emptyObjectSchema,
  z.object({
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
  }).strict()
);

module.exports = {
  reviewProfessionalVerificationSchema,
  getPendingProfessionalVerificationsSchema
};

const { z } = require("zod");

const requestSchema = (bodySchema, paramsSchema, querySchema) => {
  return z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  });
};

const emptyObjectSchema = z.object({}).strict();

const reviewProfessionalVerificationSchema = requestSchema(
  z.object({
    decision: z.enum(["approved", "rejected"]),
    rejection_reason: z.string().trim().max(2000).optional(),
    admin_notes: z.string().trim().max(5000).nullable().optional()
  }).strict().superRefine((data, context) => {
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
        message: "A rejection reason is not allowed for approved applications."
      });
    }
  }),
  z.object({
    applicationId: z.string().uuid()
  }).strict(),
  emptyObjectSchema
);

const getPendingProfessionalVerificationsSchema = requestSchema(
  emptyObjectSchema,
  emptyObjectSchema,
  z.object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  }).strict()
);

const getProfessionalVerificationDocumentAccessSchema = requestSchema(
  emptyObjectSchema,
  z.object({
    applicationId: z.string().uuid(),
    documentId: z.string().uuid()
  }).strict(),
  emptyObjectSchema
);

module.exports = {
  reviewProfessionalVerificationSchema,
  getPendingProfessionalVerificationsSchema,
  getProfessionalVerificationDocumentAccessSchema
};
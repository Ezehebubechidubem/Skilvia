
const { z } = require("zod");

const emptyObjectSchema = z.object({}).strict();

const uuidSchema = z.string().uuid("Invalid identifier.");

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

const verificationDocumentTypeSchema = z.enum([
  "national_id",
  "drivers_license",
  "international_passport",
  "voters_card",
  "proof_of_address",
  "business_registration",
  "selfie"
]);

const verificationFileFormatSchema = z.enum([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf"
]);

const legalFullNameSchema = z.string()
  .trim()
  .min(3)
  .max(150);

const dateOfBirthSchema = z.string().date();

const countrySchema = z.string()
  .trim()
  .min(2)
  .max(100);

const stateSchema = z.string()
  .trim()
  .min(2)
  .max(100);

const citySchema = z.string()
  .trim()
  .min(2)
  .max(100);

const submitVerificationSchema = requestSchema(
  z.object({
    legal_full_name: legalFullNameSchema,
    date_of_birth: dateOfBirthSchema.optional(),
    country: countrySchema.default("Nigeria"),
    state: stateSchema.optional(),
    city: citySchema.optional()
  }).strict()
);

const updateVerificationDraftSchema = requestSchema(
  z.object({
    legal_full_name: legalFullNameSchema.optional(),
    date_of_birth: dateOfBirthSchema.optional(),
    country: countrySchema.optional(),
    state: stateSchema.optional(),
    city: citySchema.optional()
  })
    .strict()
    .refine(
      (data) => Object.keys(data).length > 0,
      {
        message: "Provide at least one field to update."
      }
    ),
  z.object({
    applicationId: uuidSchema
  }).strict()
);

const createVerificationUploadSessionSchema = requestSchema(
  z.object({
    document_type: verificationDocumentTypeSchema,
    file_format: verificationFileFormatSchema
  }).strict(),
  z.object({
    applicationId: uuidSchema
  }).strict()
);

const uploadVerificationDocumentSchema = requestSchema(
  z.object({
    upload_token: z.string().trim().min(20).max(500)
  }).strict(),
  z.object({
    applicationId: uuidSchema
  }).strict()
);

const getVerificationApplicationSchema = requestSchema(
  emptyObjectSchema,
  z.object({
    applicationId: uuidSchema
  }).strict()
);

const deleteVerificationDocumentSchema = requestSchema(
  emptyObjectSchema,
  z.object({
    applicationId: uuidSchema,
    documentId: uuidSchema
  }).strict()
);

const getMyVerificationStatusSchema = requestSchema();

const submitDraftVerificationApplicationSchema = requestSchema(
  emptyObjectSchema,
  z.object({
    applicationId: uuidSchema
  }).strict()
);

module.exports = {
  verificationDocumentTypeSchema,
  verificationFileFormatSchema,
  submitVerificationSchema,
  updateVerificationDraftSchema,
  createVerificationUploadSessionSchema,
  uploadVerificationDocumentSchema,
  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,
  getMyVerificationStatusSchema,
  submitDraftVerificationApplicationSchema
};

const { z } = require("zod");


// =====================================================
// SHARED VALIDATION HELPERS
// =====================================================

const emptyObjectSchema = z.object({}).strict();

const uuidSchema = z.string().uuid("Invalid identifier.");

const requestSchema = (
  bodySchema = emptyObjectSchema,
  paramsSchema = emptyObjectSchema,
  querySchema = emptyObjectSchema
) => {
  return z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  }).strict();
};


// =====================================================
// DOCUMENT VALIDATION
// =====================================================

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


// =====================================================
// SUBMIT VERIFICATION APPLICATION
// =====================================================

const submitVerificationSchema = requestSchema(
  z.object({
    legal_full_name: z.string()
      .trim()
      .min(3)
      .max(150),

    date_of_birth: z.string()
      .date()
      .optional(),

    country: z.string()
      .trim()
      .min(2)
      .max(100)
      .default("Nigeria"),

    state: z.string()
      .trim()
      .min(2)
      .max(100)
      .optional(),

    city: z.string()
      .trim()
      .min(2)
      .max(100)
      .optional()
  }).strict()
);


// =====================================================
// CREATE DOCUMENT UPLOAD AUTHORIZATION
// =====================================================

const createVerificationUploadSessionSchema = requestSchema(
  z.object({
    document_type: verificationDocumentTypeSchema,

    file_format: verificationFileFormatSchema
  }).strict(),

  z.object({
    applicationId: uuidSchema
  }).strict()
);


// =====================================================
// VERIFY AND REGISTER UPLOADED DOCUMENT
// =====================================================

const uploadVerificationDocumentSchema = requestSchema(
  z.object({
    upload_token: z.string()
      .trim()
      .min(20)
      .max(500)
  }).strict(),

  z.object({
    applicationId: uuidSchema
  }).strict()
);


// =====================================================
// GET VERIFICATION APPLICATION
// =====================================================

const getVerificationApplicationSchema = requestSchema(
  emptyObjectSchema,

  z.object({
    applicationId: uuidSchema
  }).strict()
);


// =====================================================
// DELETE VERIFICATION DOCUMENT
// =====================================================

const deleteVerificationDocumentSchema = requestSchema(
  emptyObjectSchema,

  z.object({
    applicationId: uuidSchema,
    documentId: uuidSchema
  }).strict()
);


// =====================================================
// GET MY VERIFICATION STATUS
// =====================================================

const getMyVerificationStatusSchema = requestSchema();


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  verificationDocumentTypeSchema,
  verificationFileFormatSchema,

  submitVerificationSchema,

  createVerificationUploadSessionSchema,
  uploadVerificationDocumentSchema,

  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,

  getMyVerificationStatusSchema
};
const { z } = require("zod");


// =====================================================
// SHARED SCHEMAS
// =====================================================

const emptyObjectSchema = z.object({}).strict();

const uuidSchema = z.string().uuid(
  "Invalid identifier."
);

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
// PROFESSIONAL VERIFICATION DOCUMENT TYPES
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
// UPLOAD VERIFICATION DOCUMENT
// =====================================================

const uploadVerificationDocumentSchema = requestSchema(
  z.object({

    document_type: verificationDocumentTypeSchema,

    // Cloudinary upload identifiers are generated
    // by the backend, never trusted from the client.
    upload_token: z.string()
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
// REMOVE VERIFICATION DOCUMENT
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
  submitVerificationSchema,
  uploadVerificationDocumentSchema,
  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,
  getMyVerificationStatusSchema
};
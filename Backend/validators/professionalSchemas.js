
const { z } = require("zod");

const requestSchema = (bodySchema, paramsSchema = z.unknown()) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: z.unknown()
  });


// =====================================================
// PROFESSIONAL PROFILE FIELDS
// =====================================================

const professionalProfileFields = {
  business_name: z.string().trim().max(150).nullable().optional(),

  professional_title: z.string().trim().min(2).max(120),

  bio: z.string().trim().max(3000).nullable().optional(),

  years_of_experience: z.coerce.number()
    .int()
    .min(0)
    .max(80)
    .optional(),

  country: z.string().trim().min(2).max(100).optional(),

  state: z.string().trim().max(100).nullable().optional(),

  city: z.string().trim().max(100).nullable().optional(),

  service_area: z.string().trim().max(500).nullable().optional(),

  latitude: z.coerce.number()
    .min(-90)
    .max(90)
    .nullable()
    .optional(),

  longitude: z.coerce.number()
    .min(-180)
    .max(180)
    .nullable()
    .optional(),

  availability_status: z.enum([
    "available",
    "busy",
    "unavailable"
  ]).optional()
};


// =====================================================
// CREATE PROFESSIONAL PROFILE
// =====================================================

const createProfessionalProfileSchema = requestSchema(
  z.object({
    ...professionalProfileFields
  }).strict()
);


// =====================================================
// UPDATE PROFESSIONAL PROFILE
// =====================================================

const updateProfessionalProfileSchema = requestSchema(
  z.object({
    ...professionalProfileFields,
    professional_title: professionalProfileFields.professional_title.optional()
  })
    .strict()
    .refine(
      (data) => Object.keys(data).length > 0,
      {
        message: "Provide at least one profile field to update."
      }
    )
);


// =====================================================
// PROFILE ID PARAMETERS
// =====================================================

const profileIdParamsSchema = z.object({
  profileId: z.string().uuid("Invalid professional profile ID.")
}).strict();


// =====================================================
// PROFILE AVAILABILITY UPDATE
// =====================================================

const updateAvailabilitySchema = requestSchema(
  z.object({
    availability_status: z.enum([
      "available",
      "busy",
      "unavailable"
    ])
  }).strict(),
  profileIdParamsSchema
);


// =====================================================
// PROFESSIONAL PROFILE ID VALIDATION
// =====================================================

const getProfessionalProfileSchema = requestSchema(
  z.object({}).strict(),
  profileIdParamsSchema
);


module.exports = {
  createProfessionalProfileSchema,
  updateProfessionalProfileSchema,
  updateAvailabilitySchema,
  getProfessionalProfileSchema,
  profileIdParamsSchema
};

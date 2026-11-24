
const { z } = require("zod");


// =====================================================
// REQUEST SCHEMA HELPER
// =====================================================

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
// SETTING KEY VALIDATION
// =====================================================

const settingKeySchema = z.string()
  .trim()
  .min(2)
  .max(150)
  .regex(
    /^[a-z][a-z0-9_.]*$/,
    "Invalid platform setting key."
  );


// =====================================================
// GET PLATFORM SETTINGS
// =====================================================

const getPlatformSettingsSchema = requestSchema(
  z.object({}).strict(),
  z.object({}).strict(),
  z.object({
    category: z.string()
      .trim()
      .min(2)
      .max(100)
      .optional(),

    public_only: z.enum(["true", "false"])
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
      .default(30)
  }).strict()
);


// =====================================================
// GET ONE PLATFORM SETTING
// =====================================================

const settingKeyParamsSchema = z.object({
  settingKey: settingKeySchema
}).strict();

const getPlatformSettingSchema = requestSchema(
  z.object({}).strict(),
  settingKeyParamsSchema
);


// =====================================================
// CREATE A NEW SETTING VERSION
// =====================================================

const createPlatformSettingVersionSchema = requestSchema(
  z.object({
    setting_value: z.json(),

    effective_from: z.string()
      .datetime({
        offset: true
      })
      .optional()
  }).strict(),
  settingKeyParamsSchema
);


// =====================================================
// GET SETTING VERSION HISTORY
// =====================================================

const getPlatformSettingHistorySchema = requestSchema(
  z.object({}).strict(),
  settingKeyParamsSchema,
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
      .default(20)
  }).strict()
);


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  settingKeySchema,
  getPlatformSettingsSchema,
  getPlatformSettingSchema,
  createPlatformSettingVersionSchema,
  getPlatformSettingHistorySchema
};


const express = require("express");

const router = express.Router();


// =====================================================
// CONTROLLERS
// =====================================================

const {
  getPlatformSettings,
  getPlatformSetting,
  createSettingVersion,
  getSettingHistory,
  getPublicPlatformSettings
} = require("../controllers/platformSettingsController");


// =====================================================
// MIDDLEWARE
// =====================================================

const authenticate = require("../middleware/authenticate");

const authorize = require("../middleware/authorize");

const validate = require("../middleware/validate");

const {
  apiLimiter
} = require("../middleware/security");


// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const {
  getPlatformSettingsSchema,
  getPlatformSettingSchema,
  createPlatformSettingVersionSchema,
  getPlatformSettingHistorySchema
} = require("../validators/platformSettingSchemas");


// =====================================================
// PUBLIC PLATFORM SETTINGS
// =====================================================

// GET /api/settings/public
// No authentication required.
// Only settings marked is_public are returned.

router.get(
  "/public",
  apiLimiter,
  getPublicPlatformSettings
);


// =====================================================
// ADMINISTRATOR AUTHORIZATION
// =====================================================

router.use(authenticate);

router.use(authorize("admin"));

router.use(apiLimiter);


// =====================================================
// ADMIN PLATFORM SETTINGS
// =====================================================

// GET /api/admin/platform-settings
// Retrieve all administrative platform settings.

router.get(
  "/",
  validate(getPlatformSettingsSchema),
  getPlatformSettings
);


// GET /api/admin/platform-settings/:settingKey
// Retrieve one setting and its current effective value.

router.get(
  "/:settingKey",
  validate(getPlatformSettingSchema),
  getPlatformSetting
);


// GET /api/admin/platform-settings/:settingKey/history
// Retrieve historical versions of a setting.

router.get(
  "/:settingKey/history",
  validate(getPlatformSettingHistorySchema),
  getSettingHistory
);


// POST /api/admin/platform-settings/:settingKey/versions
// Create a new setting version or schedule a future change.

router.post(
  "/:settingKey/versions",
  validate(createPlatformSettingVersionSchema),
  createSettingVersion
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;

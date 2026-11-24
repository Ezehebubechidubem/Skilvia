
const express = require("express");

const router = express.Router();


// =====================================================
// CONTROLLERS
// =====================================================

const {
  getPlatformSettings,
  getPlatformSetting,
  createSettingVersion,
  getSettingHistory
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
// ADMINISTRATOR SECURITY
// =====================================================

router.use(authenticate);
router.use(authorize("admin"));
router.use(apiLimiter);


// =====================================================
// LIST PLATFORM SETTINGS
// =====================================================

// GET /api/admin/platform-settings

router.get(
  "/",
  validate(getPlatformSettingsSchema),
  getPlatformSettings
);


// =====================================================
// GET ONE PLATFORM SETTING
// =====================================================

// GET /api/admin/platform-settings/:settingKey

router.get(
  "/:settingKey",
  validate(getPlatformSettingSchema),
  getPlatformSetting
);


// =====================================================
// GET SETTING VERSION HISTORY
// =====================================================

// GET /api/admin/platform-settings/:settingKey/history

router.get(
  "/:settingKey/history",
  validate(getPlatformSettingHistorySchema),
  getSettingHistory
);


// =====================================================
// CREATE SETTING VERSION
// =====================================================

// POST /api/admin/platform-settings/:settingKey/versions

router.post(
  "/:settingKey/versions",
  validate(createPlatformSettingVersionSchema),
  createSettingVersion
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;

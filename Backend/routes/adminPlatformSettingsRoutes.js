
const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireAdminPermission = require("../middleware/requireAdminPermission");
const validate = require("../middleware/validate");

const {
  getPlatformSettingsSchema,
  getPlatformSettingSchema,
  createPlatformSettingVersionSchema,
  getPlatformSettingHistorySchema
} = require("../validators/platformSettingSchemas");

const {
  getPlatformSettings,
  getPlatformSetting,
  createSettingVersion,
  getSettingHistory
} = require("../controllers/platformSettingsController");


// =====================================================
// AUTHENTICATION
// =====================================================

router.use(authenticate);


// =====================================================
// VIEW PLATFORM SETTINGS
// =====================================================

// GET /api/admin/platform-settings

router.get(
  "/",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingsSchema),
  getPlatformSettings
);


// =====================================================
// VIEW SETTING HISTORY
// =====================================================

// GET /api/admin/platform-settings/:settingKey/history

router.get(
  "/:settingKey/history",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingHistorySchema),
  getSettingHistory
);


// =====================================================
// VIEW INDIVIDUAL PLATFORM SETTING
// =====================================================

// GET /api/admin/platform-settings/:settingKey

router.get(
  "/:settingKey",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingSchema),
  getPlatformSetting
);


// =====================================================
// CREATE A NEW SETTING VERSION
// =====================================================

// POST /api/admin/platform-settings/:settingKey/versions

router.post(
  "/:settingKey/versions",
  requireAdminPermission("admin.settings.write"),
  validate(createPlatformSettingVersionSchema),
  createSettingVersion
);


module.exports = router;

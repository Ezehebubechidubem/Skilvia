
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

router.get(
  "/",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingsSchema),
  getPlatformSettings
);


// =====================================================
// VIEW SETTING HISTORY
// =====================================================

router.get(
  "/:settingKey/history",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingHistorySchema),
  getSettingHistory
);


// =====================================================
// VIEW INDIVIDUAL PLATFORM SETTING
// =====================================================

router.get(
  "/:settingKey",
  requireAdminPermission("admin.settings.read"),
  validate(getPlatformSettingSchema),
  getPlatformSetting
);


// =====================================================
// CREATE SETTING VERSION
// =====================================================

// Immediate changes require:
// admin.settings.write
//
// Scheduled changes require:
// admin.settings.write
// admin.settings.schedule

const requireSettingWritePermission = (req, res, next) => {
  const writePermission = requireAdminPermission(
    "admin.settings.write"
  );

  return writePermission(req, res, (error) => {
    if (error) {
      return next(error);
    }

    const effectiveFrom =
      req.validated?.body?.effective_from;

    // No effective_from means an immediate setting change.
    if (!effectiveFrom) {
      return next();
    }

    const schedulePermission = requireAdminPermission(
      "admin.settings.schedule"
    );

    return schedulePermission(req, res, next);
  });
};


router.post(
  "/:settingKey/versions",
  validate(createPlatformSettingVersionSchema),
  requireSettingWritePermission,
  createSettingVersion
);


module.exports = router;

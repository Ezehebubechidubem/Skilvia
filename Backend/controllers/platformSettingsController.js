
const platformSettingsService = require("../services/platformSettingsService");


// =====================================================
// HELPERS
// =====================================================

const getRequestMetadata = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get("user-agent") || null,
  requestId: req.id || null
});

const sendControllerError = (next, error) => {
  return next(error);
};


// =====================================================
// GET ADMIN PLATFORM SETTINGS
// =====================================================

const getPlatformSettings = async (req, res, next) => {
  try {
    const query = req.validated.query;

    const result =
      await platformSettingsService.getPlatformSettings({
        category: query.category || null,
        publicOnly: false,
        page: query.page,
        limit: query.limit
      });

    return res.status(200).json({
      success: true,
      message: "Platform settings retrieved successfully.",
      data: result
    });

  } catch (error) {
    return sendControllerError(next, error);
  }
};


// =====================================================
// GET ONE ADMIN PLATFORM SETTING
// =====================================================

const getPlatformSetting = async (req, res, next) => {
  try {
    const { settingKey } = req.validated.params;

    const setting =
      await platformSettingsService.getEffectiveSetting(
        settingKey
      );

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Platform setting was not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Platform setting retrieved successfully.",
      data: setting
    });

  } catch (error) {
    return sendControllerError(next, error);
  }
};


// =====================================================
// CREATE A NEW SETTING VERSION
// =====================================================

const createSettingVersion = async (req, res, next) => {
  try {
    const { settingKey } = req.validated.params;

    const {
      setting_value,
      effective_from
    } = req.validated.body;

    const result =
      await platformSettingsService.createSettingVersion({
        settingKey,
        settingValue: setting_value,
        effectiveFrom: effective_from,
        adminUserId: req.auth.userId,
        ...getRequestMetadata(req)
      });

    return res.status(201).json({
      success: true,
      message: "Platform setting version created successfully.",
      data: result
    });

  } catch (error) {
    return sendControllerError(next, error);
  }
};


// =====================================================
// GET SETTING VERSION HISTORY
// =====================================================

const getSettingHistory = async (req, res, next) => {
  try {
    const { settingKey } = req.validated.params;
    const query = req.validated.query;

    const result =
      await platformSettingsService.getSettingHistory({
        settingKey,
        page: query.page,
        limit: query.limit
      });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Platform setting was not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Platform setting history retrieved successfully.",
      data: result
    });

  } catch (error) {
    return sendControllerError(next, error);
  }
};


// =====================================================
// GET PUBLIC PLATFORM SETTINGS
// =====================================================

const getPublicPlatformSettings = async (req, res, next) => {
  try {
    const result =
      await platformSettingsService.getPlatformSettings({
        category: null,
        publicOnly: true,
        page: 1,
        limit: 100
      });

    // Return only the public setting fields.
    const settings = result.settings.map((setting) => ({
      setting_key: setting.setting_key,
      category: setting.category,
      setting_value: setting.setting_value,
      version_number: setting.version_number,
      effective_from: setting.effective_from
    }));

    return res.status(200).json({
      success: true,
      message: "Public platform settings retrieved successfully.",
      data: {
        settings
      }
    });

  } catch (error) {
    return sendControllerError(next, error);
  }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  getPlatformSettings,
  getPlatformSetting,
  createSettingVersion,
  getSettingHistory,
  getPublicPlatformSettings
};

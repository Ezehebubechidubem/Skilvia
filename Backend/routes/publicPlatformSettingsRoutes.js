
const express = require("express");

const router = express.Router();

const {
  getPublicPlatformSettings
} = require("../controllers/platformSettingsController");


// =====================================================
// PUBLIC PLATFORM SETTINGS
// =====================================================

// GET /api/settings/public
//
// No login required.
// Returns only settings marked as public.
// No administrative operations are available here.

router.get(
  "/public",
  getPublicPlatformSettings
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;

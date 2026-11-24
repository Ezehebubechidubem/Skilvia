
const express = require("express");
const router = express.Router();

const sessionController = require("../controllers/sessionController");

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");

const {
  authLimiter
} = require("../middleware/security");

const {
  revokeSessionSchema
} = require("../validators/sessionSchemas");

// =====================================
// GET ACTIVE SESSIONS
// =====================================

router.get(
  "/",
  authenticate,
  authLimiter,
  sessionController.getSessions
);

// =====================================
// REVOKE A SELECTED SESSION
// =====================================

router.delete(
  "/:sessionId",
  authenticate,
  authLimiter,
  validate(revokeSessionSchema),
  sessionController.revokeSession
);

module.exports = router;

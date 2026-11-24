
const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");

const validate = require("../middleware/validate");
const authenticate = require("../middleware/authenticate");

const {
  authLimiter
} = require("../middleware/security");

const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema
} = require("../validators/authSchemas");

// =====================================
// PUBLIC AUTHENTICATION ROUTES
// =====================================

// Register a new customer or professional.
router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  authController.register
);

// Log in.
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  authController.login
);

// Refresh access and refresh tokens.
router.post(
  "/refresh",
  authLimiter,
  validate(refreshTokenSchema),
  authController.refresh
);

// =====================================
// PROTECTED AUTHENTICATION ROUTES
// =====================================

// Log out the current session.
router.post(
  "/logout",
  authenticate,
  validate(logoutSchema),
  authController.logout
);

// Log out all sessions belonging to the user.
router.post(
  "/logout-all",
  authenticate,
  authController.logoutAll
);

// =====================================
// EXPORT ROUTER
// =====================================

module.exports = router;

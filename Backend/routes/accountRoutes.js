
const express = require("express");
const router = express.Router();

const accountController = require("../controllers/accountController");

const validate = require("../middleware/validate");
const authenticate = require("../middleware/authenticate");

const {
  authLimiter
} = require("../middleware/security");

const {
  verifyEmailSchema,
  resendVerificationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema
} = require("../validators/accountSchemas");

// =====================================
// EMAIL VERIFICATION
// =====================================

// Verify email using the token sent to the user's email.
router.post(
  "/verify-email",
  authLimiter,
  validate(verifyEmailSchema),
  accountController.verifyEmail
);

// Resend verification email to the logged-in user.
router.post(
  "/resend-verification",
  authenticate,
  authLimiter,
  validate(resendVerificationSchema),
  accountController.resendVerification
);

// =====================================
// PASSWORD RECOVERY
// =====================================

// Request a password reset email.
router.post(
  "/forgot-password",
  authLimiter,
  validate(requestPasswordResetSchema),
  accountController.requestPasswordReset
);

// Submit a new password using the reset token.
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  accountController.resetPassword
);

// =====================================
// AUTHENTICATED ACCOUNT SECURITY
// =====================================

// Change password while logged in.
router.post(
  "/change-password",
  authenticate,
  authLimiter,
  validate(changePasswordSchema),
  accountController.changePassword
);

module.exports = router;

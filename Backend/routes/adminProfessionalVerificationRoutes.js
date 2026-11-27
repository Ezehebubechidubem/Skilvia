
const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const requireAdminPermission = require("../middleware/requireAdminPermission");

const {
  reviewProfessionalVerificationSchema
} = require("../validators/adminProfessionalVerificationSchemas");

const {
  reviewApplication
} = require("../controllers/adminProfessionalVerificationReviewController");

const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);

// Only administrators with the KYC review permission
// can approve or reject professional verification applications.
router.post(
  "/applications/:applicationId/review",
  requireAdminPermission("admin.professional_verification.review"),
  validate(reviewProfessionalVerificationSchema),
  reviewApplication
);

module.exports = router;

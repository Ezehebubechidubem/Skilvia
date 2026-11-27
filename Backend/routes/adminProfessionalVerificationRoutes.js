
const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const requireAdminPermission = require("../middleware/requireAdminPermission");

const {
  reviewProfessionalVerificationSchema,
  getPendingProfessionalVerificationsSchema
} = require("../validators/adminProfessionalVerificationSchemas");

const {
  reviewApplication
} = require("../controllers/adminProfessionalVerificationReviewController");

const {
  getPendingApplications
} = require("../controllers/adminProfessionalVerificationQueueController");

const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);

// Retrieve pending professional KYC applications.
router.get(
  "/applications/pending",
  requireAdminPermission("admin.professional_verification.review"),
  validate(getPendingProfessionalVerificationsSchema),
  getPendingApplications
);

// Approve or reject a pending professional KYC application.
router.post(
  "/applications/:applicationId/review",
  requireAdminPermission("admin.professional_verification.review"),
  validate(reviewProfessionalVerificationSchema),
  reviewApplication
);

module.exports = router;

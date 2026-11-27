const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const requireAdminPermission = require("../middleware/requireAdminPermission");

const {
  reviewProfessionalVerificationSchema,
  getPendingProfessionalVerificationsSchema,
  getProfessionalVerificationDocumentAccessSchema
} = require("../validators/adminProfessionalVerificationSchemas");

const {
  reviewApplication
} = require("../controllers/adminProfessionalVerificationReviewController");

const {
  getPendingApplications
} = require("../controllers/adminProfessionalVerificationQueueController");

const {
  getVerificationDocumentAccess
} = require("../controllers/adminProfessionalVerificationDocumentController");

const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);

router.get(
  "/applications/pending",
  requireAdminPermission("admin.professional_verification.review"),
  validate(getPendingProfessionalVerificationsSchema),
  getPendingApplications
);

router.get(
  "/applications/:applicationId/documents/:documentId/access",
  requireAdminPermission("admin.professional_verification.review"),
  validate(getProfessionalVerificationDocumentAccessSchema),
  getVerificationDocumentAccess
);

router.post(
  "/applications/:applicationId/review",
  requireAdminPermission("admin.professional_verification.review"),
  validate(reviewProfessionalVerificationSchema),
  reviewApplication
);

module.exports = router;
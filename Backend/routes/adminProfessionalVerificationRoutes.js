const express = require("express");

const authenticate = require("../middleware/authenticate");
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

// Viewing pending applications requires professional-read permission.
router.get(
  "/applications/pending",
  requireAdminPermission("admin.professionals.read"),
  validate(getPendingProfessionalVerificationsSchema),
  getPendingApplications
);

// Viewing identity documents also requires professional-read permission.
router.get(
  "/applications/:applicationId/documents/:documentId/access",
  requireAdminPermission("admin.professionals.read"),
  validate(getProfessionalVerificationDocumentAccessSchema),
  getVerificationDocumentAccess
);

// Approving or rejecting applications requires approval permission.
router.post(
  "/applications/:applicationId/review",
  requireAdminPermission("admin.professionals.approve"),
  validate(reviewProfessionalVerificationSchema),
  reviewApplication
);

module.exports = router;
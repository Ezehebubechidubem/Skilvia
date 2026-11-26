
const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const professionalVerificationController = require("../controllers/professionalVerificationController");

const {
  submitVerificationSchema,
  createVerificationUploadSessionSchema,
  uploadVerificationDocumentSchema,
  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,
  getMyVerificationStatusSchema
} = require("../validators/professionalVerificationSchemas");

router.use(authenticate);
router.use(apiLimiter);

// Create a new draft verification application.
router.post(
  "/applications",
  validate(submitVerificationSchema),
  professionalVerificationController.submitApplication
);

// Create an upload session for a draft application.
router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  professionalVerificationController.createDocumentUploadSession
);

// Register an uploaded document after Cloudinary verification.
router.post(
  "/applications/:applicationId/documents",
  validate(uploadVerificationDocumentSchema),
  professionalVerificationController.registerUploadedDocument
);

// Delete a document from a draft application only.
router.delete(
  "/applications/:applicationId/documents/:documentId",
  validate(deleteVerificationDocumentSchema),
  professionalVerificationController.deleteUploadedDocument
);

// Submit a completed draft for admin review.
router.post(
  "/applications/:applicationId/submit",
  validate(getVerificationApplicationSchema),
  professionalVerificationController.submitDraftApplication
);

// Get the professional's verification status.
router.get(
  "/status",
  validate(getMyVerificationStatusSchema),
  professionalVerificationController.getMyStatus
);

// Get one application belonging to the authenticated professional.
router.get(
  "/applications/:applicationId",
  validate(getVerificationApplicationSchema),
  professionalVerificationController.getMyApplication
);

module.exports = router;

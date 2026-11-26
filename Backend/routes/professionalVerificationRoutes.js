
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

// Create an upload session for a document belonging to a draft.
router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  professionalVerificationController.createDocumentUploadSession
);

// Register a document after it has been uploaded to Cloudinary.
router.post(
  "/applications/:applicationId/documents",
  validate(uploadVerificationDocumentSchema),
  professionalVerificationController.registerUploadedDocument
);

// Formally submit a draft application for admin review.
router.post(
  "/applications/:applicationId/submit",
  validate(getVerificationApplicationSchema),
  professionalVerificationController.submitDraftApplication
);

// Get the professional's current verification status.
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

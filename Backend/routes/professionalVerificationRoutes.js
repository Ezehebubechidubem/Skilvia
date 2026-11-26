
const express = require("express");

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const controller = require("../controllers/professionalVerificationController");

const {
  submitVerificationSchema,
  updateVerificationDraftSchema,
  createVerificationUploadSessionSchema,
  uploadVerificationDocumentSchema,
  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,
  getMyVerificationStatusSchema,
  submitDraftVerificationApplicationSchema
} = require("../validators/professionalVerificationSchemas");

const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);

// Create or resume a verification draft.
router.post(
  "/applications",
  validate(submitVerificationSchema),
  controller.submitApplication
);

// Update an existing verification draft.
router.patch(
  "/applications/:applicationId",
  validate(updateVerificationDraftSchema),
  controller.updateDraftApplication
);

// Create a secure Cloudinary upload session.
router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  controller.createDocumentUploadSession
);

// Register an uploaded verification document.
router.post(
  "/applications/:applicationId/documents",
  validate(uploadVerificationDocumentSchema),
  controller.registerUploadedDocument
);

// Delete a document from an existing draft.
router.delete(
  "/applications/:applicationId/documents/:documentId",
  validate(deleteVerificationDocumentSchema),
  controller.deleteUploadedDocument
);

// Submit a completed draft for admin review.
router.post(
  "/applications/:applicationId/submit",
  validate(submitDraftVerificationApplicationSchema),
  controller.submitDraftApplication
);

// Retrieve the professional's verification status.
router.get(
  "/status",
  validate(getMyVerificationStatusSchema),
  controller.getMyStatus
);

// Retrieve a specific verification application.
router.get(
  "/applications/:applicationId",
  validate(getVerificationApplicationSchema),
  controller.getMyApplication
);

module.exports = router;

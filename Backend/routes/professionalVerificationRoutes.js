const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { validate } = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const {
  receiveVerificationDocument
} = require("../middleware/professionalVerificationUpload");

const {
  submitVerificationSchema,
  updateVerificationDraftSchema,
  createVerificationUploadSessionSchema,
  uploadVerificationDocumentSchema,
  getVerificationApplicationSchema,
  deleteVerificationDocumentSchema,
  submitDraftVerificationApplicationSchema
} = require("../validators/professionalVerificationSchemas");

const {
  submitApplication,
  updateDraftApplication,
  createDocumentUploadSession,
  registerUploadedDocument,
  deleteUploadedDocument,
  submitDraftApplication,
  getMyStatus,
  getMyApplication
} = require("../controllers/professionalVerificationController");


const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);


// Create or resume a verification application draft.
router.post(
  "/applications",
  validate(submitVerificationSchema),
  submitApplication
);


// Update an existing verification application draft.
router.patch(
  "/applications/:applicationId",
  validate(updateVerificationDraftSchema),
  updateDraftApplication
);


// Create a document upload session.
router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  createDocumentUploadSession
);


// Upload a verification document.
// Multipart processing must happen before validation.
router.post(
  "/applications/:applicationId/documents",
  receiveVerificationDocument,
  validate(uploadVerificationDocumentSchema),
  registerUploadedDocument
);


// Delete a verification document from an editable application.
router.delete(
  "/applications/:applicationId/documents/:documentId",
  validate(deleteVerificationDocumentSchema),
  deleteUploadedDocument
);


// Submit a completed draft for admin review.
router.post(
  "/applications/:applicationId/submit",
  validate(submitDraftVerificationApplicationSchema),
  submitDraftApplication
);


// Get the authenticated professional's verification status.
router.get(
  "/status",
  validate(undefined),
  getMyStatus
);


// Get one verification application.
router.get(
  "/applications/:applicationId",
  validate(getVerificationApplicationSchema),
  getMyApplication
);


module.exports = router;
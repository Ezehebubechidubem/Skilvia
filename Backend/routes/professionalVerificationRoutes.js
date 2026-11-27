const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { validate } = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const {
  receiveVerificationDocument
} = require("../middleware/professionalVerificationUpload");

const {
  submitApplicationSchema,
  updateVerificationDraftSchema,
  createUploadSessionSchema,
  registerDocumentSchema,
  applicationIdParamSchema,
  documentIdParamSchema,
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
  validate({
    body: submitApplicationSchema
  }),
  submitApplication
);


// Update an existing verification application draft.
router.patch(
  "/applications/:applicationId",
  validate({
    params: applicationIdParamSchema,
    body: updateVerificationDraftSchema
  }),
  updateDraftApplication
);


// Create a short-lived document upload session.
router.post(
  "/applications/:applicationId/upload-session",
  validate({
    params: applicationIdParamSchema,
    body: createUploadSessionSchema
  }),
  createDocumentUploadSession
);


// Upload a verification document.
// Multer must run before validation because the request is multipart/form-data.
router.post(
  "/applications/:applicationId/documents",
  receiveVerificationDocument,
  validate({
    params: applicationIdParamSchema,
    body: registerDocumentSchema
  }),
  registerUploadedDocument
);


// Delete a document from an editable draft.
router.delete(
  "/applications/:applicationId/documents/:documentId",
  validate({
    params: documentIdParamSchema
  }),
  deleteUploadedDocument
);


// Submit a completed draft for admin review.
router.post(
  "/applications/:applicationId/submit",
  validate({
    params: applicationIdParamSchema,
    body: submitDraftVerificationApplicationSchema
  }),
  submitDraftApplication
);


// Get the authenticated professional's verification status.
router.get(
  "/status",
  getMyStatus
);


// Get one verification application belonging to the authenticated professional.
router.get(
  "/applications/:applicationId",
  validate({
    params: applicationIdParamSchema
  }),
  getMyApplication
);


module.exports = router;
const express = require("express");

// Authentication middleware is exported directly.
const authenticate = require("../middleware/authenticate");

const validate = require("../middleware/validate");
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
  getMyVerificationStatusSchema,
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

// =====================================
// GLOBAL ROUTE MIDDLEWARE
// =====================================

router.use(authenticate);
router.use(apiLimiter);

// =====================================
// CREATE OR RESUME APPLICATION
// =====================================

router.post(
  "/applications",
  validate(submitVerificationSchema),
  submitApplication
);

// =====================================
// UPDATE APPLICATION DRAFT
// =====================================

router.patch(
  "/applications/:applicationId",
  validate(updateVerificationDraftSchema),
  updateDraftApplication
);

// =====================================
// CREATE DOCUMENT UPLOAD SESSION
// =====================================

router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  createDocumentUploadSession
);

// =====================================
// UPLOAD VERIFICATION DOCUMENT
// =====================================

// Multer processes multipart/form-data before validation.
router.post(
  "/applications/:applicationId/documents",
  receiveVerificationDocument,
  validate(uploadVerificationDocumentSchema),
  registerUploadedDocument
);

// =====================================
// DELETE VERIFICATION DOCUMENT
// =====================================

router.delete(
  "/applications/:applicationId/documents/:documentId",
  validate(deleteVerificationDocumentSchema),
  deleteUploadedDocument
);

// =====================================
// SUBMIT APPLICATION FOR ADMIN REVIEW
// =====================================

router.post(
  "/applications/:applicationId/submit",
  validate(submitDraftVerificationApplicationSchema),
  submitDraftApplication
);

// =====================================
// GET PROFESSIONAL VERIFICATION STATUS
// =====================================

router.get(
  "/status",
  validate(getMyVerificationStatusSchema),
  getMyStatus
);

// =====================================
// GET VERIFICATION APPLICATION
// =====================================

router.get(
  "/applications/:applicationId",
  validate(getVerificationApplicationSchema),
  getMyApplication
);

// =====================================
// EXPORT ROUTER
// =====================================

module.exports = router;
const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");

const { apiLimiter } = require("../middleware/security");

const professionalVerificationController = require(
  "../controllers/professionalVerificationController"
);

const {
  submitVerificationSchema,
  createVerificationUploadSessionSchema,
  getVerificationApplicationSchema,
  getMyVerificationStatusSchema
} = require("../validators/professionalVerificationSchemas");


// =====================================================
// PROFESSIONAL VERIFICATION ROUTES
// =====================================================

router.use(authenticate);
router.use(apiLimiter);


// =====================================================
// SUBMIT VERIFICATION APPLICATION
// =====================================================

router.post(
  "/applications",
  validate(submitVerificationSchema),
  professionalVerificationController.submitApplication
);


// =====================================================
// CREATE DOCUMENT UPLOAD AUTHORIZATION
// =====================================================

router.post(
  "/applications/:applicationId/upload-session",
  validate(createVerificationUploadSessionSchema),
  professionalVerificationController.createDocumentUploadSession
);


// =====================================================
// GET MY VERIFICATION STATUS
// =====================================================

router.get(
  "/status",
  validate(getMyVerificationStatusSchema),
  professionalVerificationController.getMyStatus
);


// =====================================================
// GET MY VERIFICATION APPLICATION
// =====================================================

router.get(
  "/applications/:applicationId",
  validate(getVerificationApplicationSchema),
  professionalVerificationController.getMyApplication
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;
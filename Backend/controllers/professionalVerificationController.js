const {
  ProfessionalVerificationError,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
} = require("../services/professionalVerificationService");

const {
  createVerificationUploadSession
} = require("../services/professionalVerificationUploadService");


// =====================================================
// ERROR HANDLING
// =====================================================

const handleControllerError = (error, next) => {
  if (error instanceof ProfessionalVerificationError) {
    error.statusCode = error.statusCode || 400;
  }

  return next(error);
};


// =====================================================
// SUBMIT VERIFICATION APPLICATION
// =====================================================

const submitApplication = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const data = req.validated.body;

    const application = await submitVerificationApplication(
      userId,
      data
    );

    return res.status(201).json({
      success: true,
      message: "Verification application submitted successfully.",
      data: {
        application
      }
    });

  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// GET MY VERIFICATION STATUS
// =====================================================

const getMyStatus = async (req, res, next) => {
  try {
    const userId = req.auth.userId;

    const verification = await getMyVerificationStatus(userId);

    return res.status(200).json({
      success: true,
      message: "Verification status retrieved successfully.",
      data: verification
    });

  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// GET MY VERIFICATION APPLICATION
// =====================================================

const getMyApplication = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const { applicationId } = req.validated.params;

    const application = await getVerificationApplication(
      userId,
      applicationId
    );

    return res.status(200).json({
      success: true,
      message: "Verification application retrieved successfully.",
      data: application
    });

  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// CREATE DOCUMENT UPLOAD AUTHORIZATION
// =====================================================

const createDocumentUploadSession = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const { applicationId } = req.validated.params;

    const {
      document_type,
      file_format
    } = req.validated.body;

    const uploadSession = await createVerificationUploadSession(
      userId,
      applicationId,
      document_type,
      file_format
    );

    return res.status(201).json({
      success: true,
      message: "Document upload authorization created successfully.",
      data: uploadSession
    });

  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  submitApplication,
  getMyStatus,
  getMyApplication,
  createDocumentUploadSession
};
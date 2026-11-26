
const {
  ProfessionalVerificationError,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
} = require("../services/professionalVerificationService");

const {
  createVerificationUploadSession
} = require("../services/professionalVerificationUploadService");

const {
  registerVerificationDocument
} = require("../services/professionalVerificationDocumentService");

const {
  submitDraftForReview
} = require("../services/professionalVerificationSubmissionService");

const handleControllerError = (res, error) => {
  if (error instanceof ProfessionalVerificationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  console.error("Professional verification controller error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred while processing your verification request."
  });
};

// Create a new draft verification application.
const submitApplication = async (req, res) => {
  try {
    const result = await submitVerificationApplication(
      req.auth.userId,
      req.validated.body
    );

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// Create a secure Cloudinary upload session for a draft application.
const createDocumentUploadSession = async (req, res) => {
  try {
    const result = await createVerificationUploadSession(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body.document_type,
      req.validated.body.file_format
    );

    return res.status(201).json({
      success: true,
      message: "Verification document upload session created.",
      upload: result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// Register an uploaded document after Cloudinary verification.
const registerUploadedDocument = async (req, res) => {
  try {
    const result = await registerVerificationDocument(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body.upload_token
    );

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// Formally submit a draft application for admin review.
const submitDraftApplication = async (req, res) => {
  try {
    const result = await submitDraftForReview(
      req.auth.userId,
      req.validated.params.applicationId
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// Get the professional's current verification status.
const getMyStatus = async (req, res) => {
  try {
    const result = await getMyVerificationStatus(
      req.auth.userId
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// Get one verification application belonging to the professional.
const getMyApplication = async (req, res) => {
  try {
    const result = await getVerificationApplication(
      req.auth.userId,
      req.validated.params.applicationId
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

module.exports = {
  submitApplication,
  createDocumentUploadSession,
  registerUploadedDocument,
  submitDraftApplication,
  getMyStatus,
  getMyApplication
};

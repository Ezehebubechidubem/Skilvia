
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
  deleteProfessionalVerificationDocument
} = require("../services/professionalVerificationDocumentDeletionService");

const {
  submitDraftForReview
} = require("../services/professionalVerificationSubmissionService");

const {
  updateProfessionalVerificationDraft
} = require("../services/professionalVerificationDraftService");

const handleControllerError = (res, error, message) => {
  if (error instanceof ProfessionalVerificationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  console.error(message, error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred."
  });
};

const submitApplication = async (req, res) => {
  try {
    const result = await submitVerificationApplication(
      req.auth.userId,
      req.validated.body
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification application error:"
    );
  }
};

const updateDraftApplication = async (req, res) => {
  try {
    const result = await updateProfessionalVerificationDraft(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification draft update error:"
    );
  }
};

const createDocumentUploadSession = async (req, res) => {
  try {
    const result = await createVerificationUploadSession(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body
    );

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification upload session error:"
    );
  }
};

const registerUploadedDocument = async (req, res) => {
  try {
    const result = await registerVerificationDocument(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body
    );

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification document registration error:"
    );
  }
};

const deleteUploadedDocument = async (req, res) => {
  try {
    const result = await deleteProfessionalVerificationDocument(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.params.documentId
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification document deletion error:"
    );
  }
};

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
    return handleControllerError(
      res,
      error,
      "Professional verification submission error:"
    );
  }
};

const getMyStatus = async (req, res) => {
  try {
    const result = await getMyVerificationStatus(req.auth.userId);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Professional verification status retrieval error:"
    );
  }
};

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
    return handleControllerError(
      res,
      error,
      "Professional verification application retrieval error:"
    );
  }
};

module.exports = {
  submitApplication,
  updateDraftApplication,
  createDocumentUploadSession,
  registerUploadedDocument,
  deleteUploadedDocument,
  submitDraftApplication,
  getMyStatus,
  getMyApplication
};

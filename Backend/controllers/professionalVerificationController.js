const {
  ProfessionalVerificationError,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
} = require("../services/professionalVerificationService");

const {
  updateProfessionalVerificationDraft
} = require("../services/professionalVerificationDraftService");

const {
  createVerificationUploadSession
} = require("../services/professionalVerificationUploadService");

const {
  uploadVerificationDocument
} = require("../services/professionalVerificationDocumentUploadService");

const {
  deleteProfessionalVerificationDocument
} = require("../services/professionalVerificationDocumentService");

const {
  submitDraftForReview
} = require("../services/professionalVerificationSubmissionService");


function handleControllerError(res, error, context) {
  if (error instanceof ProfessionalVerificationError) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message
    });
  }

  console.error(`${context}:`, error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred. Please try again later."
  });
}


async function submitApplication(req, res) {
  try {
    const result = await submitVerificationApplication(
      req.auth.userId,
      req.validated.body
    );

    return res.status(result.resumed ? 200 : 201).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Submit professional verification application"
    );
  }
}


async function updateDraftApplication(req, res) {
  try {
    const result = await updateProfessionalVerificationDraft(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body
    );

    return res.status(200).json({
      success: true,
      message: "Verification application draft updated successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Update professional verification draft"
    );
  }
}


async function createDocumentUploadSession(req, res) {
  try {
    const result = await createVerificationUploadSession(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.body
    );

    return res.status(201).json({
      success: true,
      message: "Document upload session created successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Create professional verification upload session"
    );
  }
}


async function registerUploadedDocument(req, res) {
  try {
    const { applicationId } = req.validated.params;
    const { upload_token: uploadToken } = req.validated.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "A verification document file is required."
      });
    }

    const result = await uploadVerificationDocument(
      req.auth.userId,
      applicationId,
      uploadToken,
      req.file
    );

    return res.status(201).json({
      success: true,
      message: "Verification document uploaded successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Upload professional verification document"
    );
  }
}


async function deleteUploadedDocument(req, res) {
  try {
    const result = await deleteProfessionalVerificationDocument(
      req.auth.userId,
      req.validated.params.applicationId,
      req.validated.params.documentId
    );

    return res.status(200).json({
      success: true,
      message: "Verification document deleted successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Delete professional verification document"
    );
  }
}


async function submitDraftApplication(req, res) {
  try {
    const result = await submitDraftForReview(
      req.auth.userId,
      req.validated.params.applicationId
    );

    return res.status(200).json({
      success: true,
      message: "Verification application submitted successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Submit professional verification draft for review"
    );
  }
}


async function getMyStatus(req, res) {
  try {
    const result = await getMyVerificationStatus(
      req.auth.userId
    );

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Get professional verification status"
    );
  }
}


async function getMyApplication(req, res) {
  try {
    const result = await getVerificationApplication(
      req.auth.userId,
      req.validated.params.applicationId
    );

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "Get professional verification application"
    );
  }
}


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
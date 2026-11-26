const {
  ProfessionalVerificationError,
  submitVerificationApplication,
  getMyVerificationStatus,
  getVerificationApplication
} = require("../services/professionalVerificationService");


// =====================================================
// ERROR HANDLER
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

    const verification = await getMyVerificationStatus(
      userId
    );

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
// GET ONE VERIFICATION APPLICATION
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
// EXPORTS
// =====================================================

module.exports = {
  submitApplication,
  getMyStatus,
  getMyApplication
};
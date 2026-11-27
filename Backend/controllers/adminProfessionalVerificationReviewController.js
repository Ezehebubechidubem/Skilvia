
const {
  ProfessionalVerificationError
} = require("../services/professionalVerificationService");

const {
  reviewProfessionalVerificationApplication
} = require("../services/adminProfessionalVerificationReviewService");

const reviewApplication = async (req, res, next) => {
  try {
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({
        success: false,
        message: "Administrator authentication is required."
      });
    }

    if (!req.validated) {
      return res.status(400).json({
        success: false,
        message: "Request validation is required."
      });
    }

    const { applicationId } = req.validated.params;

    const {
      decision,
      rejection_reason,
      admin_notes
    } = req.validated.body;

    const result = await reviewProfessionalVerificationApplication({
      adminId: req.auth.userId,
      applicationId,
      decision,
      rejectionReason: rejection_reason,
      adminNotes: admin_notes
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    if (error instanceof ProfessionalVerificationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return next(error);
  }
};

module.exports = {
  reviewApplication
};

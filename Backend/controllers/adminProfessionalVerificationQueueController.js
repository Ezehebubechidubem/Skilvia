
const {
  ProfessionalVerificationError
} = require("../services/professionalVerificationService");

const {
  getPendingProfessionalVerifications
} = require("../services/adminProfessionalVerificationQueueService");

const getPendingApplications = async (req, res, next) => {
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

    const { page, limit } = req.validated.query;

    const result = await getPendingProfessionalVerifications({
      adminId: req.auth.userId,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      message: "Pending professional verification applications retrieved successfully.",
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
  getPendingApplications
};

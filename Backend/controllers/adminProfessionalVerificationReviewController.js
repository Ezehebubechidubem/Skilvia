const {
  ProfessionalVerificationError
} = require("../services/professionalVerificationService");

const {
  reviewProfessionalVerificationApplication
} = require("../services/adminProfessionalVerificationReviewService");

const reviewApplication = async (req, res, next) => {
  try {
    const adminId = req.auth?.userId;
    const { applicationId } = req.validated.params;

    const {
      decision,
      rejection_reason,
      admin_notes
    } = req.validated.body;

    const result = await reviewProfessionalVerificationApplication({
      adminId,
      applicationId,
      decision,
      rejectionReason: rejection_reason ?? null,
      adminNotes: admin_notes ?? null,

      // Metadata for the existing permanent admin audit log.
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      requestId: req.id || null
    });

    return res.status(200).json({
      success: true,
      message: decision === "approved"
        ? "Professional verification approved successfully."
        : "Professional verification rejected successfully.",
      data: result
    });
  } catch (error) {
    if (error instanceof ProfessionalVerificationError) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }

    console.error(JSON.stringify({
      event: "admin_professional_verification_review_controller_failed",
      timestamp: new Date().toISOString(),
      admin_id: req.auth?.userId || null,
      application_id: req.validated?.params?.applicationId || null,
      error_name: error?.name || "Error",
      error_code: error?.code || null
    }));

    return next(error);
  }
};

module.exports = {
  reviewApplication
};
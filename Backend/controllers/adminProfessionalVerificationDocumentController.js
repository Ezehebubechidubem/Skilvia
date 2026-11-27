const {
  ProfessionalVerificationError
} = require("../services/professionalVerificationService");

const {
  getAdminVerificationDocumentUrl
} = require("../services/adminProfessionalVerificationDocumentService");

const getVerificationDocumentAccess = async (req, res, next) => {
  try {
    const result = await getAdminVerificationDocumentUrl({
      adminId: req.auth?.userId,
      applicationId: req.validated.params.applicationId,
      documentId: req.validated.params.documentId,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      requestId: req.id || null
    });

    return res.status(200).json({
      success: true,
      message: "Verification document access generated successfully.",
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
      event: "admin_professional_verification_document_controller_failed",
      timestamp: new Date().toISOString(),
      admin_id: req.auth?.userId || null,
      application_id: req.validated?.params?.applicationId || null,
      document_id: req.validated?.params?.documentId || null,
      error_name: error?.name || "Error",
      error_code: error?.code || null
    }));

    return next(error);
  }
};

module.exports = {
  getVerificationDocumentAccess
};
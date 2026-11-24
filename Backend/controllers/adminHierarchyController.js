
const {
  AdminHierarchyError,
  listAdministrators,
  getAdministrator,
  createSubAdmin,
  updateSubAdminStatus
} = require("../services/adminHierarchyService");

const getRequestMetadata = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get("user-agent") || null,
  requestId: req.id || req.get("x-request-id") || null
});

const handleControllerError = (error, next) => {
  if (error instanceof AdminHierarchyError) {
    const responseError = new Error(error.message);
    responseError.statusCode = error.statusCode;
    return next(responseError);
  }

  return next(error);
};


// =====================================================
// LIST ADMINISTRATORS
// =====================================================

const getAdministrators = async (req, res, next) => {
  try {
    const result = await listAdministrators(
      req.validated.query
    );

    return res.status(200).json({
      success: true,
      message: "Administrators retrieved successfully.",
      data: result.administrators,
      pagination: result.pagination
    });
  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// GET ONE ADMINISTRATOR
// =====================================================

const getAdministratorDetails = async (req, res, next) => {
  try {
    const administrator = await getAdministrator(
      req.validated.params.adminId
    );

    return res.status(200).json({
      success: true,
      message: "Administrator details retrieved successfully.",
      data: administrator
    });
  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// CREATE SUB-ADMINISTRATOR
// =====================================================

const createSubAdministrator = async (req, res, next) => {
  try {
    const administrator = await createSubAdmin(
      req.validated.body,
      req.auth.userId,
      getRequestMetadata(req)
    );

    return res.status(201).json({
      success: true,
      message: "Sub-administrator created successfully.",
      data: administrator
    });
  } catch (error) {
    return handleControllerError(error, next);
  }
};


// =====================================================
// UPDATE SUB-ADMINISTRATOR STATUS
// =====================================================

const changeSubAdministratorStatus = async (
  req,
  res,
  next
) => {
  try {
    const administrator = await updateSubAdminStatus(
      req.validated.params.adminId,
      req.validated.body.account_status,
      req.auth.userId,
      getRequestMetadata(req)
    );

    return res.status(200).json({
      success: true,
      message: "Sub-administrator status updated successfully.",
      data: administrator
    });
  } catch (error) {
    return handleControllerError(error, next);
  }
};


module.exports = {
  getAdministrators,
  getAdministratorDetails,
  createSubAdministrator,
  changeSubAdministratorStatus
};


const {
  AdminPermissionError,
  listPermissionCatalogue,
  listAdministrators,
  getAdminPermissionAssignments,
  grantAdminPermission,
  updateAdminPermissionExpiry,
  revokeAdminPermission
} = require("../services/adminPermissionService");

const getRequestMetadata = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get("user-agent") || null,
  requestId: req.id || req.headers["x-request-id"] || null
});

const handleControllerError = (error, res, next) => {
  if (error instanceof AdminPermissionError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  return next(error);
};

const getAdministrators = async (req, res, next) => {
  try {
    const result = await listAdministrators(
      req.validated.query
    );

    return res.status(200).json({
      success: true,
      message: "Administrators retrieved successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

const getPermissionCatalogue = async (req, res, next) => {
  try {
    const query = req.validated.query;

    const result = await listPermissionCatalogue({
      category: query.category,
      activeOnly: query.active_only !== "false",
      page: query.page,
      limit: query.limit
    });

    return res.status(200).json({
      success: true,
      message: "Permission catalogue retrieved successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

const getAdministratorAssignments = async (req, res, next) => {
  try {
    const { adminId } = req.validated.params;

    const result = await getAdminPermissionAssignments(adminId);

    return res.status(200).json({
      success: true,
      message: "Administrator permissions retrieved successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

const grantPermission = async (req, res, next) => {
  try {
    const { adminId } = req.validated.params;
    const {
      permission_key: permissionKey,
      expires_at: expiresAt
    } = req.validated.body;

    if (adminId === req.auth.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot grant permissions to your own administrator account."
      });
    }

    const result = await grantAdminPermission({
      actorUserId: req.auth.userId,
      adminId,
      permissionKey,
      expiresAt,
      requestMetadata: getRequestMetadata(req)
    });

    return res.status(201).json({
      success: true,
      message: "Administrator permission granted successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

const updatePermissionExpiry = async (req, res, next) => {
  try {
    const { adminId, permissionKey } = req.validated.params;
    const { expires_at: expiresAt } = req.validated.body;

    if (adminId === req.auth.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot change permissions on your own administrator account."
      });
    }

    const result = await updateAdminPermissionExpiry({
      actorUserId: req.auth.userId,
      adminId,
      permissionKey,
      expiresAt,
      requestMetadata: getRequestMetadata(req)
    });

    return res.status(200).json({
      success: true,
      message: "Administrator permission expiry updated successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

const revokePermission = async (req, res, next) => {
  try {
    const { adminId, permissionKey } = req.validated.params;

    if (adminId === req.auth.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot revoke permissions from your own administrator account."
      });
    }

    const result = await revokeAdminPermission({
      actorUserId: req.auth.userId,
      adminId,
      permissionKey,
      requestMetadata: getRequestMetadata(req)
    });

    return res.status(200).json({
      success: true,
      message: "Administrator permission revoked successfully.",
      data: result
    });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

module.exports = {
  getAdministrators,
  getPermissionCatalogue,
  getAdministratorAssignments,
  grantPermission,
  updatePermissionExpiry,
  revokePermission
};

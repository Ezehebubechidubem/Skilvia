
// =====================================
// ROLE-BASED AUTHORIZATION MIDDLEWARE
// =====================================

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Ensure the user has already been authenticated.
      if (!req.auth || !req.auth.userId) {
        return res.status(401).json({
          success: false,
          message: "Please log in to access this resource."
        });
      }

      // Ensure roles were supplied correctly.
      if (
        allowedRoles.length === 0 ||
        allowedRoles.some(
          (role) => typeof role !== "string" || !role.trim()
        )
      ) {
        console.error("Invalid authorization configuration.");

        return res.status(500).json({
          success: false,
          message: "Authorization service is unavailable."
        });
      }

      // Get the authenticated user's role.
      const userRole = req.auth.role;

      // Reject users without an authorized role.
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action."
        });
      }

      // Permission granted.
      return next();

    } catch (error) {
      console.error("Authorization error:", error);

      return res.status(500).json({
        success: false,
        message: "An authorization error occurred."
      });
    }
  };
};

module.exports = authorize;

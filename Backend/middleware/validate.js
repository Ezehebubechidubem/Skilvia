const { z } = require("zod");

// =====================================
// REQUEST VALIDATION MIDDLEWARE
// =====================================

const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Normalize an absent request body.
      // GET requests commonly have no request body.
      const requestData = {
        body: req.body ?? {},
        params: req.params ?? {},
        query: req.query ?? {}
      };

      // Validate request body, URL parameters and query.
      const result = schema.safeParse(requestData);

      // Reject invalid information.
      if (!result.success) {
        // Safe diagnostic logging.
        // Never log passwords, tokens, PINs or request bodies.
        console.warn(JSON.stringify({
          event: "request_validation_failed",
          timestamp: new Date().toISOString(),
          method: req.method,
          route: req.route?.path || req.baseUrl || "unknown",
          issue_count: result.error.issues.length,
          fields: [
            ...new Set(
              result.error.issues.map((issue) =>
                issue.path
                  .filter((part) => typeof part === "string")
                  .join(".")
              )
            )
          ]
        }));

        return res.status(400).json({
          success: false,
          message: "Please check the information you submitted.",
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message
          }))
        });
      }

      // Store validated and sanitized information.
      // Controllers should use req.validated instead of
      // directly trusting the original request data.
      req.validated = Object.freeze(result.data);

      return next();

    } catch (error) {
      console.error(JSON.stringify({
        event: "request_validation_middleware_error",
        timestamp: new Date().toISOString(),
        method: req.method,
        route: req.route?.path || req.baseUrl || "unknown",
        error_name: error?.name || "Error",
        error_message: error?.message || "Unknown validation error"
      }));

      return next(error);
    }
  };
};

module.exports = validate;
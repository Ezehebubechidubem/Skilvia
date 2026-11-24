
const { z } = require("zod");

// =====================================
// REQUEST VALIDATION MIDDLEWARE
// =====================================

const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Validate request body, URL parameters and query.
      const result = schema.safeParse({
        body: req.body,
        params: req.params,
        query: req.query
      });

      // Reject invalid information.
      if (!result.success) {
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
      return next(error);
    }
  };
};

module.exports = validate;

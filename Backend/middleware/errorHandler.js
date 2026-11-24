
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: "The requested resource was not found."
  });
};

const errorHandler = (error, req, res, next) => {
  // If the response has already started, delegate the error.
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || "An unexpected error occurred.";

  // Invalid JSON request body
  if (error.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Invalid JSON request body.";
  }

  // Request body too large
  if (error.type === "entity.too.large") {
    statusCode = 413;
    message = "The submitted data is too large.";
  }

  // Invalid JWT
  if (error.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  }

  // Expired JWT
  if (error.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your authentication token has expired.";
  }

  // Invalid uploaded file
  if (error.name === "MulterError") {
    statusCode = 400;
    message = "There was a problem with the uploaded file.";
  }

  // Zod validation error
  if (error.name === "ZodError") {
    statusCode = 400;
    message = "Some submitted information is invalid.";
  }

  // PostgreSQL unique constraint violation
  if (error.code === "23505") {
    statusCode = 409;
    message = "This information already exists.";
  }

  // PostgreSQL foreign key violation
  if (error.code === "23503") {
    statusCode = 400;
    message = "The requested record could not be found.";
  }

  // PostgreSQL invalid input syntax
  if (error.code === "22P02") {
    statusCode = 400;
    message = "Invalid data was submitted.";
  }

  // Prevent invalid HTTP status codes
  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    statusCode = 500;
  }

  // Log technical details on the server, not in the response.
  if (statusCode >= 500) {
    console.error("SKILVIA SERVER ERROR:", error);
  }

  const response = {
    success: false,
    message:
      statusCode >= 500
        ? "An internal server error occurred."
        : message
  };

  // Include validation details only in development.
  if (
    process.env.NODE_ENV !== "production" &&
    error.name === "ZodError"
  ) {
    response.errors = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message
    }));
  }

  return res.status(statusCode).json(response);
};

module.exports = {
  notFoundHandler,
  errorHandler
};

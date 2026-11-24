
const jwt = require("jsonwebtoken");

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

const authenticate = (req, res, next) => {
  try {
    // Ensure JWT secret is configured
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Authentication service is unavailable."
      });
    }

    // Get authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in."
      });
    }

    // Require Bearer token format
    const parts = authHeader.trim().split(/\s+/);

    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== "bearer" ||
      !parts[1]
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication format."
      });
    }

    const token = parts[1];

    // Verify JWT signature and expiration
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
        clockTolerance: 5
      }
    );

    // Ensure the token contains the required identity
    // and represents an access token.
    if (
      typeof decoded !== "object" ||
      !decoded.sub ||
      typeof decoded.sub !== "string" ||
      decoded.type !== "access"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token."
      });
    }

    // Attach verified authentication information
    req.auth = Object.freeze({
      userId: decoded.sub,
      role: decoded.role || null,
      tokenId: decoded.jti || null
    });

    // Continue to the protected route
    return next();

  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired. Please log in again."
      });
    }

    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "An authentication error occurred."
    });
  }
};

module.exports = authenticate;

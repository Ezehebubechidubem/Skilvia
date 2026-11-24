
const jwt = require("jsonwebtoken");

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

const authenticate = (req, res, next) => {
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
      console.error("JWT_SECRET is missing or invalid.");

      return res.status(500).json({
        success: false,
        message: "Authentication service is unavailable."
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in."
      });
    }

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

    // Verify signature, expiry, issuer and audience.
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "skillvia-api",
      audience: "skillvia-app",
      clockTolerance: 5
    });

    // Only access tokens can authenticate API requests.
    if (
      typeof decoded !== "object" ||
      !decoded.sub ||
      typeof decoded.sub !== "string" ||
      decoded.type !== "access" ||
      !decoded.jti
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token."
      });
    }

    // Attach verified user information to the request.
    req.auth = Object.freeze({
      userId: decoded.sub,
      role: decoded.role || null,
      tokenId: decoded.jti
    });

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

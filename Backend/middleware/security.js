
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// =====================================
// 1. HTTP SECURITY HEADERS
// =====================================

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests:
        process.env.NODE_ENV === "production"
          ? []
          : null
    }
  },

  // Prevent browsers from guessing file content types.
  xContentTypeOptions: true,

  // Prevent the application from being embedded in other websites.
  xFrameOptions: {
    action: "deny"
  },

  // Hide unnecessary technology information.
  hidePoweredBy: true
});

// =====================================
// 2. CORS CONFIGURATION
// =====================================

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Native mobile applications and server-to-server
    // requests may not provide an origin.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error("This origin is not allowed to access SKILVIA.")
    );
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],

  maxAge: 86400
};

const corsMiddleware = cors(corsOptions);

// =====================================
// 3. GENERAL API RATE LIMITER
// =====================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 100,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

// =====================================
// 4. AUTHENTICATION RATE LIMITER
// =====================================

// More restrictive protection for login,
// registration and password-related endpoints.

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many authentication attempts. Please try again later."
  }
});

// =====================================
// 5. PAYMENT RATE LIMITER
// =====================================

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 20,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many payment requests. Please try again later."
  }
});

// =====================================
// EXPORT SECURITY MIDDLEWARE
// =====================================

module.exports = {
  securityHeaders,
  corsMiddleware,
  apiLimiter,
  authLimiter,
  paymentLimiter
};

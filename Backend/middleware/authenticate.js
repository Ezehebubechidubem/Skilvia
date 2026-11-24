const { verifyAccessToken } = require("../utils/tokens");
const { pool } = require("../config/database");

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

const authenticate = async (req, res, next) => {
  try {
    // =====================================
    // 1. CHECK AUTHORIZATION HEADER
    // =====================================

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

    const accessToken = parts[1];

    // =====================================
    // 2. VERIFY ACCESS TOKEN
    // =====================================

    let decoded;

    try {
      decoded = verifyAccessToken(accessToken);
    } catch (error) {
      if (
        error.name === "TokenExpiredError" ||
        error.name === "JsonWebTokenError" ||
        error.name === "NotBeforeError"
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Your session is invalid or has expired. Please log in again."
        });
      }

      throw error;
    }

    // =====================================
    // 3. CHECK USER AND SESSION IN DATABASE
    // =====================================

    const result = await pool.query(
      `SELECT
        u.id,
        u.role,
        u.account_status,

        EXISTS (
          SELECT 1
          FROM refresh_tokens rt
          WHERE rt.user_id = u.id
            AND rt.token_family = $2
            AND rt.revoked_at IS NULL
            AND rt.expires_at > NOW()
        ) AS session_active

      FROM users u
      WHERE u.id = $1
      LIMIT 1`,
      [
        decoded.sub,
        decoded.family
      ]
    );

    // =====================================
    // 4. CONFIRM USER EXISTS
    // =====================================

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "This account could not be found. Please log in again."
      });
    }

    const user = result.rows[0];

    // =====================================
    // 5. CHECK ACCOUNT STATUS
    // =====================================

    if (user.account_status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not active. Please contact SKILVIA support."
      });
    }

    // =====================================
    // 6. CHECK SESSION REVOCATION
    // =====================================

    if (user.session_active !== true) {
      return res.status(401).json({
        success: false,
        message:
          "Your session has been revoked. Please log in again."
      });
    }

    // =====================================
    // 7. ATTACH CURRENT USER INFORMATION
    // =====================================

    req.auth = Object.freeze({
      userId: String(user.id),
      role: user.role,
      tokenId: decoded.jti,
      tokenFamily: decoded.family
    });

    return next();

  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Authentication service is temporarily unavailable."
    });
  }
};

// =====================================
// EXPORT MIDDLEWARE
// =====================================

module.exports = authenticate;
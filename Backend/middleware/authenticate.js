
const net = require("net");

const { verifyAccessToken } = require("../utils/tokens");
const { pool } = require("../config/database");

const authenticate = async (req, res, next) => {
  try {
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

    let decoded;

    try {
      decoded = verifyAccessToken(parts[1]);
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

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "This account could not be found. Please log in again."
      });
    }

    const user = result.rows[0];

    if (user.account_status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not active. Please contact SKILVIA support."
      });
    }

    if (user.session_active !== true) {
      return res.status(401).json({
        success: false,
        message:
          "Your session has been revoked. Please log in again."
      });
    }

    // =====================================
    // UPDATE DEVICE ACTIVITY
    // =====================================

    let ipAddress = req.ip || null;

    if (ipAddress && ipAddress.startsWith("::ffff:")) {
      ipAddress = ipAddress.substring(7);
    }

    if (!ipAddress || !net.isIP(ipAddress)) {
      ipAddress = null;
    }

    await pool.query(
      `UPDATE refresh_tokens
       SET last_seen_at = NOW(),
           last_ip_address = COALESCE($3::inet, last_ip_address)
       WHERE user_id = $1
         AND token_family = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [
        decoded.sub,
        decoded.family,
        ipAddress
      ]
    );

    // =====================================
    // ATTACH AUTHENTICATED USER
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

module.exports = authenticate;


const { verifyAccessToken } = require("../utils/tokens");
const { pool } = require("../config/database");

// =====================================
// SOCKET AUTHENTICATION MIDDLEWARE
// =====================================

const socketAuthenticate = async (socket, next) => {
  try {
    // Get access token from Socket.IO authentication.
    const accessToken = socket.handshake.auth?.accessToken;

    if (
      typeof accessToken !== "string" ||
      !accessToken.trim() ||
      accessToken.length > 8192
    ) {
      return next(
        new Error("Authentication required for this connection.")
      );
    }

    // Verify JWT signature and claims.
    let decoded;

    try {
      decoded = verifyAccessToken(accessToken);
    } catch {
      return next(
        new Error("Your session is invalid or has expired.")
      );
    }

    // Confirm that the user and session still exist.
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
      return next(
        new Error("Your account could not be found.")
      );
    }

    const user = result.rows[0];

    if (user.account_status !== "active") {
      return next(
        new Error("Your account is not active.")
      );
    }

    if (user.session_active !== true) {
      return next(
        new Error("Your session has been revoked. Please log in again.")
      );
    }

    // Attach verified identity to the socket.
    socket.auth = Object.freeze({
      userId: String(user.id),
      role: user.role,
      tokenId: decoded.jti,
      tokenFamily: decoded.family
    });

    return next();

  } catch (error) {
    console.error(
      "SKILVIA Socket authentication error:",
      error.message
    );

    return next(
      new Error("Real-time authentication is temporarily unavailable.")
    );
  }
};

// =====================================
// EXPORT
// =====================================

module.exports = socketAuthenticate;

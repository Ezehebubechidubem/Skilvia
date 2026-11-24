
const { pool } = require("../config/database");

// =====================================
// GET ALL ACTIVE USER SESSIONS
// =====================================

const getSessions = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const currentTokenFamily = req.auth.tokenFamily;

    const result = await pool.query(
      `SELECT DISTINCT ON (rt.token_family)
        rt.token_family AS session_id,
        rt.device_name,
        rt.device_type,
        rt.user_agent,
        rt.last_ip_address,
        rt.created_at AS session_started_at,
        COALESCE(
          rt.last_seen_at,
          rt.created_at
        ) AS last_active_at,
        CASE
          WHEN rt.token_family = $2 THEN TRUE
          ELSE FALSE
        END AS is_current_session
      FROM refresh_tokens rt
      WHERE rt.user_id = $1
        AND rt.revoked_at IS NULL
        AND rt.expires_at > NOW()
      ORDER BY
        rt.token_family,
        rt.created_at DESC`,
      [
        userId,
        currentTokenFamily
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Active sessions retrieved successfully.",
      totalSessions: result.rowCount,
      sessions: result.rows
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// REVOKE A SELECTED SESSION
// =====================================

const revokeSession = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const sessionId = req.validated.params.sessionId;
    const currentTokenFamily = req.auth.tokenFamily;

    if (sessionId === currentTokenFamily) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot revoke your current session here. Please use the logout option."
      });
    }

    const result = await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(),
           revoked_reason = 'user_logout'
       WHERE user_id = $1
         AND token_family = $2
         AND revoked_at IS NULL`,
      [
        userId,
        sessionId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          "This active session was not found."
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "The selected device session has been logged out successfully."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// EXPORT SESSION CONTROLLERS
// =====================================

module.exports = {
  getSessions,
  revokeSession
};


const { pool } = require("../config/database");

const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_DATABASE_FAILURES = 3;

// =====================================
// MONITOR AUTHENTICATED SOCKET SESSION
// =====================================

const monitorSocketSession = (socket) => {
  if (
    !socket.auth ||
    !socket.auth.userId ||
    !socket.auth.tokenFamily
  ) {
    throw new Error(
      "An authenticated socket session is required."
    );
  }

  let checking = false;
  let databaseFailures = 0;

  const checkSession = async () => {
    if (checking || !socket.connected) {
      return;
    }

    checking = true;

    try {
      const result = await pool.query(
        `SELECT
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
          socket.auth.userId,
          socket.auth.tokenFamily
        ]
      );

      databaseFailures = 0;

      if (result.rowCount === 0) {
        console.warn(
          "Socket disconnected: account no longer exists."
        );

        return socket.disconnect(true);
      }

      const user = result.rows[0];

      if (
        user.account_status !== "active" ||
        user.session_active !== true
      ) {
        console.warn(
          `Revoked socket session disconnected for user ${socket.auth.userId}.`
        );

        return socket.disconnect(true);
      }

    } catch (error) {
      databaseFailures++;

      console.error(
        "Socket session verification failed:",
        error.message
      );

      // Fail closed after repeated database failures.
      if (databaseFailures >= MAX_DATABASE_FAILURES) {
        console.error(
          "Socket disconnected because session status could not be verified."
        );

        socket.disconnect(true);
      }

    } finally {
      checking = false;
    }
  };

  const timer = setInterval(
    checkSession,
    CHECK_INTERVAL_MS
  );

  // Do not keep the Node.js process alive just for this timer.
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  socket.once("disconnect", () => {
    clearInterval(timer);
  });

  return timer;
};

// =====================================
// EXPORT
// =====================================

module.exports = monitorSocketSession;

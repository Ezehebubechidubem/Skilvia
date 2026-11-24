
const crypto = require("crypto");
const { pool } = require("../config/database");

// =====================================
// TOKEN CONFIGURATION
// =====================================

const EMAIL_VERIFICATION_MINUTES = 30;
const PASSWORD_RESET_MINUTES = 15;

// =====================================
// GENERATE SECURE RANDOM TOKEN
// =====================================

const generateSecureToken = () => {
  return crypto.randomBytes(32).toString("base64url");
};

// =====================================
// HASH TOKEN
// =====================================

const hashSecureToken = (token) => {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("A valid token is required.");
  }

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

// =====================================
// CREATE EMAIL VERIFICATION TOKEN
// =====================================

const createEmailVerificationToken = async (userId) => {
  if (!userId) {
    throw new Error("A valid user ID is required.");
  }

  const token = generateSecureToken();
  const tokenHash = hashSecureToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, account_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [String(userId)]
    );

    if (
      userResult.rowCount === 0 ||
      userResult.rows[0].account_status !== "active"
    ) {
      throw new Error("Active user account not found.");
    }

    // Invalidate previous unused verification tokens.
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [String(userId)]
    );

    await client.query(
      `INSERT INTO email_verification_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        NOW() + ($3 * INTERVAL '1 minute')
      )`,
      [
        String(userId),
        tokenHash,
        EMAIL_VERIFICATION_MINUTES
      ]
    );

    await client.query("COMMIT");

    return {
      token,
      expiresInMinutes: EMAIL_VERIFICATION_MINUTES
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;

  } finally {
    client.release();
  }
};

// =====================================
// VERIFY EMAIL TOKEN
// =====================================

const verifyEmailToken = async (token) => {
  const tokenHash = hashSecureToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM email_verification_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message: "Invalid or expired verification token."
      };
    }

    const verification = tokenResult.rows[0];

    const userResult = await client.query(
      `UPDATE users
       SET email_verified_at = COALESCE(
         email_verified_at,
         NOW()
       )
       WHERE id = $1
         AND account_status = 'active'
       RETURNING id`,
      [verification.user_id]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message: "This account cannot be verified."
      };
    }

    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [verification.id]
    );

    await client.query("COMMIT");

    return {
      success: true,
      userId: String(verification.user_id)
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;

  } finally {
    client.release();
  }
};

// =====================================
// CREATE PASSWORD RESET TOKEN
// =====================================

const createPasswordResetToken = async (userId) => {
  if (!userId) {
    throw new Error("A valid user ID is required.");
  }

  const token = generateSecureToken();
  const tokenHash = hashSecureToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, account_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [String(userId)]
    );

    if (
      userResult.rowCount === 0 ||
      userResult.rows[0].account_status !== "active"
    ) {
      throw new Error("Active user account not found.");
    }

    // Invalidate previous unused reset tokens.
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [String(userId)]
    );

    await client.query(
      `INSERT INTO password_reset_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        NOW() + ($3 * INTERVAL '1 minute')
      )`,
      [
        String(userId),
        tokenHash,
        PASSWORD_RESET_MINUTES
      ]
    );

    await client.query("COMMIT");

    return {
      token,
      expiresInMinutes: PASSWORD_RESET_MINUTES
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;

  } finally {
    client.release();
  }
};

// =====================================
// RESET PASSWORD
// =====================================

const resetPasswordWithToken = async (
  token,
  newPasswordHash
) => {
  if (
    typeof newPasswordHash !== "string" ||
    !newPasswordHash.startsWith("$2")
  ) {
    throw new Error("A valid password hash is required.");
  }

  const tokenHash = hashSecureToken(token);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message: "Invalid or expired password reset token."
      };
    }

    const resetRecord = tokenResult.rows[0];

    const userResult = await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2
         AND account_status = 'active'
       RETURNING id`,
      [
        newPasswordHash,
        resetRecord.user_id
      ]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message: "This account cannot reset its password."
      };
    }

    // Mark this reset token as used.
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [resetRecord.id]
    );

    // Revoke every existing session immediately.
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [resetRecord.user_id]
    );

    // Invalidate other unused password reset tokens.
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [resetRecord.user_id]
    );

    await client.query("COMMIT");

    return {
      success: true,
      userId: String(resetRecord.user_id)
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;

  } finally {
    client.release();
  }
};

// =====================================
// EXPORT FUNCTIONS
// =====================================

module.exports = {
  generateSecureToken,
  hashSecureToken,
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  resetPasswordWithToken
};

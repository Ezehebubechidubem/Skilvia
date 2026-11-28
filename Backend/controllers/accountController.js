
const { pool } = require("../config/database");

const {
  hashPassword,
  verifyPassword
} = require("../utils/password");

const {
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  resetPasswordWithToken
} = require("../utils/oneTimeTokens");

const {
  sendVerificationEmail,
  sendPasswordResetEmail
} = require("../services/emailService");

// =====================================
// VERIFY EMAIL ADDRESS
// =====================================

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.validated.body;

    const result = await verifyEmailToken(token);

    if (!result || !result.success) {
      return res.status(400).json({
        success: false,
        message:
          "This verification link is invalid, expired or has already been used."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your email address has been verified successfully."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// RESEND EMAIL VERIFICATION
// =====================================

const resendVerification = async (req, res, next) => {
  try {
    const userId = req.auth.userId;

    const result = await pool.query(
      `SELECT
        id,
        full_name,
        email,
        account_status,
        email_verified_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Account not found."
      });
    }

    const user = result.rows[0];

    if (user.account_status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active."
      });
    }

    if (user.email_verified_at) {
      return res.status(200).json({
        success: true,
        message: "Your email address is already verified."
      });
    }

    const verificationTokenResult =
      await createEmailVerificationToken(user.id);

    // The token generator returns an object.
    // The email service requires the token string.
    await sendVerificationEmail(
      user,
      verificationTokenResult.token
    );

    return res.status(200).json({
      success: true,
      message: "A new verification email has been sent."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// REQUEST PASSWORD RESET
// =====================================

const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.validated.body;

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT
        id,
        full_name,
        email,
        account_status
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = result.rows[0];

    // Do not reveal whether an account exists.
    if (user && user.account_status === "active") {
      const passwordResetTokenResult =
        await createPasswordResetToken(user.id);

      // Pass only the actual token string to the email service.
      await sendPasswordResetEmail(
        user,
        passwordResetTokenResult.token
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "If an active account exists with that email address, password reset instructions will be sent."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// RESET FORGOTTEN PASSWORD
// =====================================

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.validated.body;

    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must not exceed 72 bytes."
      });
    }

    const newPasswordHash = await hashPassword(
      newPassword
    );

    const result = await resetPasswordWithToken(
      token,
      newPasswordHash
    );

    if (!result || !result.success) {
      return res.status(400).json({
        success: false,
        message:
          "This password reset link is invalid, expired or has already been used."
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Your password has been changed. Please log in again."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// CHANGE PASSWORD WHILE LOGGED IN
// =====================================

const changePassword = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const {
      currentPassword,
      newPassword
    } = req.validated.body;

    const userId = req.auth.userId;

    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must not exceed 72 bytes."
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT
        id,
        password_hash,
        account_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Account not found."
      });
    }

    const user = userResult.rows[0];

    if (user.account_status !== "active") {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Your account is not active."
      });
    }

    const passwordIsValid = await verifyPassword(
      currentPassword,
      user.password_hash
    );

    if (!passwordIsValid) {
      await client.query("ROLLBACK");

      return res.status(401).json({
        success: false,
        message: "Your current password is incorrect."
      });
    }

    const newPasswordHash = await hashPassword(
      newPassword
    );

    await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Revoke every existing refresh-token session.
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message:
        "Your password has been changed successfully. Please log in again on your devices."
    });

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    return next(error);

  } finally {
    client.release();
  }
};

// =====================================
// EXPORT CONTROLLERS
// =====================================

module.exports = {
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  changePassword
};

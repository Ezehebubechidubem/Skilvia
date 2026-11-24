
const { pool } = require("../config/database");

const {
  hashPassword,
  verifyPassword
} = require("../utils/password");

const {
  createTokenPair,
  rotateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens
} = require("../utils/tokens");

const getDeviceInfo = require("../utils/deviceInfo");

// Dummy hash helps reduce timing differences when
// an email address does not exist during login.
const dummyPasswordHashPromise = hashPassword(
  "SKILVIA_DUMMY_PASSWORD_NOT_FOR_LOGIN_2026"
);

// =====================================
// PUBLIC USER RESPONSE
// =====================================

const publicUser = (user) => ({
  id: String(user.id),
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  account_status: user.account_status,
  email_verified_at: user.email_verified_at || null,
  created_at: user.created_at
});

// =====================================
// REGISTER
// =====================================

const register = async (req, res, next) => {
  try {
    const {
      full_name,
      email,
      phone,
      password,
      role
    } = req.validated.body;

    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must not exceed 72 bytes."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    // Public registration cannot create administrators.
    const safeRole =
      role === "professional" ? "professional" : "customer";

    const result = await pool.query(
      `INSERT INTO users (
        full_name,
        email,
        phone,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        account_status,
        email_verified_at,
        created_at`,
      [
        full_name.trim(),
        normalizedEmail,
        phone ? phone.trim() : null,
        passwordHash,
        safeRole
      ]
    );

    const user = result.rows[0];

    // Registration does not require email verification.
    // The user proceeds to the login screen.
    return res.status(201).json({
      success: true,
      message:
        "Your SKILVIA account has been created successfully. Please log in.",
      nextStep: "login",
      user: publicUser(user)
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// LOGIN
// =====================================

const login = async (req, res, next) => {
  try {
    const { email, password } = req.validated.body;

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT
        id,
        full_name,
        email,
        phone,
        password_hash,
        role,
        account_status,
        email_verified_at,
        created_at
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1`,
      [normalizedEmail]
    );

    const user = result.rows[0];

    let passwordIsValid = false;

    try {
      if (user) {
        passwordIsValid = await verifyPassword(
          password,
          user.password_hash
        );
      } else {
        const dummyHash = await dummyPasswordHashPromise;
        await verifyPassword(password, dummyHash);
      }
    } catch {
      passwordIsValid = false;
    }

    if (!user || !passwordIsValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    if (user.account_status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not active. Please contact SKILVIA support."
      });
    }

    // Email verification is not required for login.
    await pool.query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Collect device information and save it with the session.
    const deviceInfo = getDeviceInfo(req);

    const tokens = await createTokenPair(
      user,
      deviceInfo
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: publicUser(user),
      tokens
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// REFRESH SESSION
// =====================================

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.validated.body;

    const tokens = await rotateRefreshToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully.",
      tokens
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// LOGOUT
// =====================================

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.validated.body;

    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.sub !== req.auth.userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot revoke another user's session."
      });
    }

    await revokeRefreshToken(
      refreshToken,
      "user_logout"
    );

    return res.status(200).json({
      success: true,
      message: "You have been logged out successfully."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// LOGOUT ALL DEVICES
// =====================================

const logoutAll = async (req, res, next) => {
  try {
    const revokedSessions =
      await revokeAllUserRefreshTokens(
        req.auth.userId,
        "logout_all"
      );

    return res.status(200).json({
      success: true,
      message: "All your sessions have been logged out.",
      revokedSessions
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// EXPORT CONTROLLERS
// =====================================

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll
};

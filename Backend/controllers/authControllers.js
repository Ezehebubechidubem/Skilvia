
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

// =====================================
// DUMMY PASSWORD HASH
// =====================================

// Used when an email does not exist to reduce
// differences in login response timing.

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
  created_at: user.created_at
});

// =====================================
// 1. REGISTER USER
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

    // bcrypt supports a maximum of 72 password bytes.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must not exceed 72 bytes."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordHash = await hashPassword(password);

    // Admin accounts cannot be created through public registration.
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

    // Create and store the user's initial session.
    const tokens = await createTokenPair(user);

    return res.status(201).json({
      success: true,
      message: "Your SKILVIA account has been created successfully.",
      user: publicUser(user),
      tokens
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// 2. LOGIN USER
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

    // Use the same response for unknown emails and wrong passwords.
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

    await pool.query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // The token service checks the account status again
    // before creating the session.
    const tokens = await createTokenPair(user);

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
// 3. REFRESH ACCESS TOKEN
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
// 4. LOGOUT CURRENT SESSION
// =====================================

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.validated.body;

    // Make sure the supplied refresh token belongs
    // to the currently authenticated user.
    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.sub !== req.auth.userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot revoke another user's session."
      });
    }

    await revokeRefreshToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "You have been logged out successfully."
    });

  } catch (error) {
    return next(error);
  }
};

// =====================================
// 5. LOGOUT ALL USER SESSIONS
// =====================================

const logoutAll = async (req, res, next) => {
  try {
    const revokedSessions = await revokeAllUserRefreshTokens(
      req.auth.userId
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
// EXPORT AUTHENTICATION CONTROLLERS
// =====================================

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll
};

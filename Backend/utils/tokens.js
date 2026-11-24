
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const net = require("net");

const { pool } = require("../config/database");

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ACCESS_EXPIRES_IN =
  process.env.JWT_ACCESS_EXPIRES_IN || "15m";

const REFRESH_EXPIRES_IN =
  process.env.JWT_REFRESH_EXPIRES_IN || "7d";

if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET must contain at least 32 characters."
  );
}

if (!REFRESH_SECRET || REFRESH_SECRET.length < 32) {
  throw new Error(
    "JWT_REFRESH_SECRET must contain at least 32 characters."
  );
}

if (ACCESS_SECRET === REFRESH_SECRET) {
  throw new Error(
    "Access and refresh token secrets must be different."
  );
}

const ISSUER = "skillvia-api";
const AUDIENCE = "skillvia-app";

const ALLOWED_DEVICE_TYPES = [
  "android",
  "ios",
  "web",
  "desktop",
  "unknown"
];

const ALLOWED_REVOCATION_REASONS = [
  "user_logout",
  "logout_all",
  "password_change",
  "password_reset",
  "admin_action",
  "token_reuse",
  "account_suspension"
];

// =====================================
// TOKEN UTILITIES
// =====================================

const hashToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const createTokenError = (
  message,
  code,
  statusCode = 401
) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;

  return error;
};

const validateUser = (user) => {
  if (!user || !user.id) {
    throw new Error("A valid user ID is required.");
  }
};

const assertActiveUser = (user) => {
  if (user.account_status !== "active") {
    throw createTokenError(
      "This account is not active. Please contact SKILVIA support.",
      "ACCOUNT_NOT_ACTIVE",
      403
    );
  }
};

// =====================================
// DEVICE INFORMATION
// =====================================

const normalizeDeviceInfo = (deviceInfo = {}) => {
  const deviceName =
    typeof deviceInfo.deviceName === "string"
      ? deviceInfo.deviceName.trim().slice(0, 150)
      : null;

  const deviceType =
    ALLOWED_DEVICE_TYPES.includes(deviceInfo.deviceType)
      ? deviceInfo.deviceType
      : "unknown";

  const userAgent =
    typeof deviceInfo.userAgent === "string"
      ? deviceInfo.userAgent.slice(0, 1000)
      : null;

  const ipAddress =
    typeof deviceInfo.ipAddress === "string" &&
    net.isIP(deviceInfo.ipAddress)
      ? deviceInfo.ipAddress
      : null;

  return {
    deviceName,
    deviceType,
    userAgent,
    ipAddress
  };
};

const normalizeRevocationReason = (reason) => {
  if (ALLOWED_REVOCATION_REASONS.includes(reason)) {
    return reason;
  }

  throw new Error("Invalid session revocation reason.");
};

// =====================================
// GENERATE ACCESS TOKEN
// =====================================

const generateAccessToken = (user, tokenFamily) => {
  validateUser(user);

  if (!tokenFamily) {
    throw new Error("A valid session family is required.");
  }

  return jwt.sign(
    {
      type: "access",
      role: user.role,
      family: tokenFamily
    },
    ACCESS_SECRET,
    {
      algorithm: "HS256",
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
      expiresIn: ACCESS_EXPIRES_IN,
      issuer: ISSUER,
      audience: AUDIENCE
    }
  );
};

// =====================================
// GENERATE REFRESH TOKEN
// =====================================

const generateRefreshToken = (user, tokenFamily) => {
  validateUser(user);

  if (!tokenFamily) {
    throw new Error("A valid session family is required.");
  }

  return jwt.sign(
    {
      type: "refresh",
      role: user.role,
      family: tokenFamily
    },
    REFRESH_SECRET,
    {
      algorithm: "HS256",
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
      expiresIn: REFRESH_EXPIRES_IN,
      issuer: ISSUER,
      audience: AUDIENCE
    }
  );
};

// =====================================
// VERIFY ACCESS TOKEN
// =====================================

const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE
  });

  if (
    typeof decoded !== "object" ||
    decoded.type !== "access" ||
    !decoded.sub ||
    !decoded.jti ||
    !decoded.family
  ) {
    throw createTokenError(
      "Invalid access token.",
      "INVALID_ACCESS_TOKEN"
    );
  }

  return decoded;
};

// =====================================
// VERIFY REFRESH TOKEN
// =====================================

const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, REFRESH_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE
  });

  if (
    typeof decoded !== "object" ||
    decoded.type !== "refresh" ||
    !decoded.sub ||
    !decoded.jti ||
    !decoded.family
  ) {
    throw createTokenError(
      "Invalid refresh token.",
      "INVALID_REFRESH_TOKEN"
    );
  }

  return decoded;
};

// =====================================
// CREATE TOKEN PAIR
// =====================================

const createTokenPair = async (
  user,
  deviceInfo = {}
) => {
  validateUser(user);

  const device = normalizeDeviceInfo(deviceInfo);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, role, account_status
       FROM users
       WHERE id = $1
       FOR SHARE`,
      [String(user.id)]
    );

    if (userResult.rowCount === 0) {
      throw createTokenError(
        "User account could not be found.",
        "USER_NOT_FOUND"
      );
    }

    const currentUser = userResult.rows[0];

    assertActiveUser(currentUser);

    const tokenFamily = crypto.randomUUID();

    const accessToken = generateAccessToken(
      currentUser,
      tokenFamily
    );

    const refreshToken = generateRefreshToken(
      currentUser,
      tokenFamily
    );

    const decodedRefresh = jwt.decode(refreshToken);

    if (!decodedRefresh || !decodedRefresh.exp) {
      throw new Error("Unable to create refresh token.");
    }

    const refreshTokenHash = hashToken(refreshToken);

    await client.query(
      `INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        token_family,
        expires_at,
        device_name,
        device_type,
        user_agent,
        last_ip_address,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        String(currentUser.id),
        refreshTokenHash,
        tokenFamily,
        new Date(decodedRefresh.exp * 1000),
        device.deviceName,
        device.deviceType,
        device.userAgent,
        device.ipAddress
      ]
    );

    await client.query("COMMIT");

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_EXPIRES_IN
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;

  } finally {
    client.release();
  }
};

// =====================================
// ROTATE REFRESH TOKEN
// =====================================

const rotateRefreshToken = async (
  oldRefreshToken,
  currentDeviceInfo = null
) => {
  if (
    typeof oldRefreshToken !== "string" ||
    !oldRefreshToken.trim()
  ) {
    throw createTokenError(
      "Refresh token is required.",
      "REFRESH_TOKEN_REQUIRED"
    );
  }

  const decoded = verifyRefreshToken(oldRefreshToken);
  const oldTokenHash = hashToken(oldRefreshToken);

  const client = await pool.connect();

  let transactionStarted = false;
  let reuseDetected = false;
  let inactiveAccount = false;
  let newTokenPair = null;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const tokenResult = await client.query(
      `SELECT
        user_id,
        token_family,
        expires_at,
        revoked_at,
        device_name,
        device_type,
        user_agent,
        last_ip_address
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [oldTokenHash]
    );

    if (tokenResult.rowCount === 0) {
      throw createTokenError(
        "Refresh token is not recognized.",
        "REFRESH_TOKEN_NOT_FOUND"
      );
    }

    const storedToken = tokenResult.rows[0];

    if (
      String(storedToken.user_id) !== decoded.sub ||
      storedToken.token_family !== decoded.family
    ) {
      throw createTokenError(
        "Refresh token does not match its stored record.",
        "REFRESH_TOKEN_MISMATCH"
      );
    }

    if (storedToken.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW()),
             revoked_reason = COALESCE(
               revoked_reason,
               'token_reuse'
             )
         WHERE token_family = $1
           AND user_id = $2
           AND revoked_at IS NULL`,
        [
          storedToken.token_family,
          storedToken.user_id
        ]
      );

      reuseDetected = true;

    } else if (
      new Date(storedToken.expires_at).getTime() <= Date.now()
    ) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE token_hash = $1
           AND revoked_at IS NULL`,
        [oldTokenHash]
      );

    } else {
      const userResult = await client.query(
        `SELECT id, role, account_status
         FROM users
         WHERE id = $1
         FOR SHARE`,
        [storedToken.user_id]
      );

      if (userResult.rowCount === 0) {
        throw createTokenError(
          "User account could not be found.",
          "USER_NOT_FOUND"
        );
      }

      const currentUser = userResult.rows[0];

      if (currentUser.account_status !== "active") {
        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = NOW(),
               revoked_reason = 'account_suspension'
           WHERE user_id = $1
             AND revoked_at IS NULL`,
          [storedToken.user_id]
        );

        inactiveAccount = true;

      } else {
        const device = currentDeviceInfo
          ? normalizeDeviceInfo(currentDeviceInfo)
          : {
              deviceName: storedToken.device_name,
              deviceType: storedToken.device_type || "unknown",
              userAgent: storedToken.user_agent,
              ipAddress: storedToken.last_ip_address
            };

        const newRefreshToken = generateRefreshToken(
          currentUser,
          storedToken.token_family
        );

        const newAccessToken = generateAccessToken(
          currentUser,
          storedToken.token_family
        );

        const newDecoded = jwt.decode(newRefreshToken);

        if (!newDecoded || !newDecoded.exp) {
          throw new Error(
            "Unable to create replacement refresh token."
          );
        }

        const newTokenHash = hashToken(newRefreshToken);

        await client.query(
          `INSERT INTO refresh_tokens (
            user_id,
            token_hash,
            token_family,
            expires_at,
            device_name,
            device_type,
            user_agent,
            last_ip_address,
            last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            String(currentUser.id),
            newTokenHash,
            storedToken.token_family,
            new Date(newDecoded.exp * 1000),
            device.deviceName,
            device.deviceType,
            device.userAgent,
            device.ipAddress
          ]
        );

        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = NOW(),
               replaced_by_hash = $2,
               last_used_at = NOW()
           WHERE token_hash = $1
             AND revoked_at IS NULL`,
          [oldTokenHash, newTokenHash]
        );

        newTokenPair = {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenType: "Bearer",
          expiresIn: ACCESS_EXPIRES_IN
        };
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    throw error;

  } finally {
    client.release();
  }

  if (reuseDetected) {
    throw createTokenError(
      "Refresh token reuse detected. This session has been revoked. Please log in again.",
      "REFRESH_TOKEN_REUSE"
    );
  }

  if (inactiveAccount) {
    throw createTokenError(
      "This account is not active. Please contact SKILVIA support.",
      "ACCOUNT_NOT_ACTIVE",
      403
    );
  }

  if (!newTokenPair) {
    throw createTokenError(
      "Refresh token has expired. Please log in again.",
      "REFRESH_TOKEN_EXPIRED"
    );
  }

  return newTokenPair;
};

// =====================================
// REVOKE ONE REFRESH TOKEN
// =====================================

const revokeRefreshToken = async (
  refreshToken,
  reason = "user_logout"
) => {
  if (
    typeof refreshToken !== "string" ||
    !refreshToken.trim()
  ) {
    return false;
  }

  const revocationReason =
    normalizeRevocationReason(reason);

  let decoded;

  try {
    decoded = jwt.verify(refreshToken, REFRESH_SECRET, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      ignoreExpiration: true
    });
  } catch {
    return false;
  }

  if (
    typeof decoded !== "object" ||
    decoded.type !== "refresh" ||
    !decoded.sub ||
    !decoded.family
  ) {
    return false;
  }

  const tokenHash = hashToken(refreshToken);

  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revoked_reason = $4
     WHERE token_hash = $1
       AND user_id = $2
       AND token_family = $3
       AND revoked_at IS NULL`,
    [
      tokenHash,
      decoded.sub,
      decoded.family,
      revocationReason
    ]
  );

  return result.rowCount > 0;
};

// =====================================
// REVOKE ALL USER SESSIONS
// =====================================

const revokeAllUserRefreshTokens = async (
  userId,
  reason = "logout_all"
) => {
  if (!userId) {
    throw new Error("A valid user ID is required.");
  }

  const revocationReason =
    normalizeRevocationReason(reason);

  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revoked_reason = $2
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [
      String(userId),
      revocationReason
    ]
  );

  return result.rowCount;
};

// =====================================
// EXPORT TOKEN UTILITIES
// =====================================

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  hashToken
};

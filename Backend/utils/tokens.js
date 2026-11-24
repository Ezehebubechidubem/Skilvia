
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/database");

// =====================================
// JWT CONFIGURATION
// =====================================

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

// =====================================
// TOKEN UTILITIES
// =====================================

const hashToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const createTokenError = (message, code, statusCode = 401) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

// =====================================
// GENERATE ACCESS TOKEN
// =====================================

const generateAccessToken = (user) => {
  if (!user || !user.id) {
    throw new Error("A valid user ID is required.");
  }

  return jwt.sign(
    {
      type: "access",
      role: user.role || null
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
  if (!user || !user.id) {
    throw new Error("A valid user ID is required.");
  }

  return jwt.sign(
    {
      type: "refresh",
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
    !decoded.jti
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
// CREATE AND STORE TOKEN PAIR
// =====================================

const createTokenPair = async (user) => {
  if (!user || !user.id) {
    throw new Error("A valid user is required.");
  }

  const tokenFamily = crypto.randomUUID();

  const accessToken = generateAccessToken(user);

  const refreshToken = generateRefreshToken(
    user,
    tokenFamily
  );

  const decodedRefresh = jwt.decode(refreshToken);

  if (!decodedRefresh || !decodedRefresh.exp) {
    throw new Error("Unable to create refresh token.");
  }

  const refreshTokenHash = hashToken(refreshToken);

  await pool.query(
    `INSERT INTO refresh_tokens (
      user_id,
      token_hash,
      token_family,
      expires_at
    )
    VALUES ($1, $2, $3, $4)`,
    [
      String(user.id),
      refreshTokenHash,
      tokenFamily,
      new Date(decodedRefresh.exp * 1000)
    ]
  );

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_EXPIRES_IN
  };
};

// =====================================
// ROTATE REFRESH TOKEN
// =====================================

const rotateRefreshToken = async (oldRefreshToken) => {
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
  let expiredInDatabase = false;
  let newTokenPair = null;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock this token row to prevent concurrent rotation.
    const result = await client.query(
      `SELECT
        user_id,
        token_family,
        expires_at,
        revoked_at
      FROM refresh_tokens
      WHERE token_hash = $1
      FOR UPDATE`,
      [oldTokenHash]
    );

    if (result.rowCount === 0) {
      throw createTokenError(
        "Refresh token is not recognized.",
        "REFRESH_TOKEN_NOT_FOUND"
      );
    }

    const storedToken = result.rows[0];

    // Ensure the JWT identity matches its database record.
    if (
      storedToken.user_id !== decoded.sub ||
      storedToken.token_family !== decoded.family
    ) {
      throw createTokenError(
        "Refresh token does not match its stored record.",
        "REFRESH_TOKEN_MISMATCH"
      );
    }

    // Reuse of a revoked token indicates possible theft.
    if (storedToken.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE token_family = $1`,
        [storedToken.token_family]
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

      expiredInDatabase = true;

    } else {
      const user = {
        id: storedToken.user_id
      };

      // Generate a new refresh token in the same family.
      const newRefreshToken = generateRefreshToken(
        user,
        storedToken.token_family
      );

      const newAccessToken = generateAccessToken(user);

      const newDecoded = jwt.decode(newRefreshToken);

      const newTokenHash = hashToken(newRefreshToken);

      // Store the new refresh token hash.
      await client.query(
        `INSERT INTO refresh_tokens (
          user_id,
          token_hash,
          token_family,
          expires_at
        )
        VALUES ($1, $2, $3, $4)`,
        [
          storedToken.user_id,
          newTokenHash,
          storedToken.token_family,
          new Date(newDecoded.exp * 1000)
        ]
      );

      // Revoke the previous refresh token.
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW(),
             replaced_by_hash = $2,
             last_used_at = NOW()
         WHERE token_hash = $1`,
        [oldTokenHash, newTokenHash]
      );

      newTokenPair = {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: ACCESS_EXPIRES_IN
      };
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
      "Refresh token reuse detected. All sessions in this token family have been revoked. Please log in again.",
      "REFRESH_TOKEN_REUSE"
    );
  }

  if (expiredInDatabase) {
    throw createTokenError(
      "Refresh token has expired. Please log in again.",
      "REFRESH_TOKEN_EXPIRED"
    );
  }

  return newTokenPair;
};

// =====================================
// REVOKE A REFRESH TOKEN (LOGOUT)
// =====================================

const revokeRefreshToken = async (refreshToken) => {
  if (
    typeof refreshToken !== "string" ||
    !refreshToken.trim()
  ) {
    return false;
  }

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
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND user_id = $2
       AND token_family = $3
       AND revoked_at IS NULL`,
    [
      tokenHash,
      decoded.sub,
      decoded.family
    ]
  );

  return result.rowCount > 0;
};

// =====================================
// REVOKE ALL USER REFRESH TOKENS
// =====================================

const revokeAllUserRefreshTokens = async (userId) => {
  if (!userId) {
    throw new Error("A valid user ID is required.");
  }

  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [String(userId)]
  );

  return result.rowCount;
};

// =====================================
// EXPORT TOKEN FUNCTIONS
// =====================================

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens
};

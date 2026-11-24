
const test = require("node:test");
const assert = require("node:assert/strict");

// =====================================
// TEST ENVIRONMENT
// =====================================

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://test:test@localhost:5432/skillvia_test";

process.env.JWT_SECRET =
  "test_access_secret_for_skillvia_2026_very_secure";

process.env.JWT_REFRESH_SECRET =
  "test_refresh_secret_for_skillvia_2026_very_secure";

process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} = require("../utils/tokens");

const testUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  role: "customer"
};

const testFamily =
  "550e8400-e29b-41d4-a716-446655440001";

// =====================================
// ACCESS TOKEN GENERATION
// =====================================

test("generates a valid access token", () => {
  const token = generateAccessToken(
    testUser,
    testFamily
  );

  assert.equal(typeof token, "string");
  assert.ok(token.length > 0);
});

// =====================================
// ACCESS TOKEN VERIFICATION
// =====================================

test("verifies a valid access token", () => {
  const token = generateAccessToken(
    testUser,
    testFamily
  );

  const decoded = verifyAccessToken(token);

  assert.equal(decoded.sub, testUser.id);
  assert.equal(decoded.type, "access");
  assert.equal(decoded.family, testFamily);
});

// =====================================
// REFRESH TOKEN GENERATION
// =====================================

test("generates a valid refresh token", () => {
  const token = generateRefreshToken(
    testUser,
    testFamily
  );

  assert.equal(typeof token, "string");
  assert.ok(token.length > 0);
});

// =====================================
// REFRESH TOKEN VERIFICATION
// =====================================

test("verifies a valid refresh token", () => {
  const token = generateRefreshToken(
    testUser,
    testFamily
  );

  const decoded = verifyRefreshToken(token);

  assert.equal(decoded.sub, testUser.id);
  assert.equal(decoded.type, "refresh");
  assert.equal(decoded.family, testFamily);
});

// =====================================
// TOKEN TYPE SEPARATION
// =====================================

test("rejects a refresh token as an access token", () => {
  const refreshToken = generateRefreshToken(
    testUser,
    testFamily
  );

  assert.throws(() => {
    verifyAccessToken(refreshToken);
  });
});

test("rejects an access token as a refresh token", () => {
  const accessToken = generateAccessToken(
    testUser,
    testFamily
  );

  assert.throws(() => {
    verifyRefreshToken(accessToken);
  });
});

// =====================================
// INVALID TOKEN TESTS
// =====================================

test("rejects a malformed access token", () => {
  assert.throws(() => {
    verifyAccessToken("not-a-valid-token");
  });
});

test("rejects a malformed refresh token", () => {
  assert.throws(() => {
    verifyRefreshToken("not-a-valid-token");
  });
});

test("rejects a tampered access token", () => {
  const token = generateAccessToken(
    testUser,
    testFamily
  );

  const tamperedToken = `${token}tampered`;

  assert.throws(() => {
    verifyAccessToken(tamperedToken);
  });
});

// =====================================
// REQUIRED USER VALIDATION
// =====================================

test("rejects token generation without a valid user", () => {
  assert.throws(() => {
    generateAccessToken(null, testFamily);
  });

  assert.throws(() => {
    generateRefreshToken(null, testFamily);
  });
});

// =====================================
// REQUIRED SESSION FAMILY
// =====================================

test("rejects token generation without a session family", () => {
  assert.throws(() => {
    generateAccessToken(testUser, null);
  });

  assert.throws(() => {
    generateRefreshToken(testUser, null);
  });
});

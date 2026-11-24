
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  revokeSessionSchema
} = require("../validators/sessionSchemas");

// =====================================
// VALID SESSION ID
// =====================================

test("accepts a valid session UUID", () => {
  const result = revokeSessionSchema.safeParse({
    body: {},
    params: {
      sessionId: "550e8400-e29b-41d4-a716-446655440000"
    },
    query: {}
  });

  assert.equal(result.success, true);
});

// =====================================
// INVALID SESSION ID
// =====================================

test("rejects an invalid session UUID", () => {
  const result = revokeSessionSchema.safeParse({
    body: {},
    params: {
      sessionId: "invalid-session-id"
    },
    query: {}
  });

  assert.equal(result.success, false);
});

// =====================================
// MISSING SESSION ID
// =====================================

test("rejects a missing session ID", () => {
  const result = revokeSessionSchema.safeParse({
    body: {},
    params: {},
    query: {}
  });

  assert.equal(result.success, false);
});

// =====================================
// UNEXPECTED BODY DATA
// =====================================

test("rejects unexpected request body fields", () => {
  const result = revokeSessionSchema.safeParse({
    body: {
      userId: "another-user"
    },
    params: {
      sessionId: "550e8400-e29b-41d4-a716-446655440000"
    },
    query: {}
  });

  assert.equal(result.success, false);
});

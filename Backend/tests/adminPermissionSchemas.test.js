
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listAdminPermissionsSchema,
  listPermissionCatalogueSchema,
  getAdminPermissionAssignmentsSchema,
  grantAdminPermissionSchema,
  updateAdminPermissionSchema,
  revokeAdminPermissionSchema
} = require("../validators/adminPermissionSchemas");

const validAdminId = "550e8400-e29b-41d4-a716-446655440000";

const validPermissionKey = "admin.settings.read";

const validate = (schema, body = {}, params = {}, query = {}) =>
  schema.safeParse({ body, params, query });

test("administrator list accepts valid pagination and search", () => {
  const result = validate(
    listAdminPermissionsSchema,
    {},
    {},
    { page: "1", limit: "20", search: "admin" }
  );

  assert.equal(result.success, true);
  assert.equal(result.data.query.page, 1);
  assert.equal(result.data.query.limit, 20);
});

test("administrator list rejects invalid pagination", () => {
  const result = validate(
    listAdminPermissionsSchema,
    {},
    {},
    { page: "0", limit: "20" }
  );

  assert.equal(result.success, false);
});

test("permission catalogue accepts valid filters", () => {
  const result = validate(
    listPermissionCatalogueSchema,
    {},
    {},
    {
      category: "settings",
      active_only: "true",
      page: "1",
      limit: "30"
    }
  );

  assert.equal(result.success, true);
});

test("permission catalogue rejects invalid active_only value", () => {
  const result = validate(
    listPermissionCatalogueSchema,
    {},
    {},
    { active_only: "yes" }
  );

  assert.equal(result.success, false);
});

test("assignment lookup requires a valid administrator UUID", () => {
  const validResult = validate(
    getAdminPermissionAssignmentsSchema,
    {},
    { adminId: validAdminId }
  );

  const invalidResult = validate(
    getAdminPermissionAssignmentsSchema,
    {},
    { adminId: "not-a-uuid" }
  );

  assert.equal(validResult.success, true);
  assert.equal(invalidResult.success, false);
});

test("grant permission accepts a valid permission key", () => {
  const result = validate(
    grantAdminPermissionSchema,
    {
      permission_key: validPermissionKey
    },
    { adminId: validAdminId }
  );

  assert.equal(result.success, true);
});

test("grant permission accepts a valid future-format expiry timestamp", () => {
  const result = validate(
    grantAdminPermissionSchema,
    {
      permission_key: validPermissionKey,
      expires_at: "2030-01-01T12:00:00.000Z"
    },
    { adminId: validAdminId }
  );

  assert.equal(result.success, true);
});

test("grant permission rejects malformed permission keys", () => {
  const result = validate(
    grantAdminPermissionSchema,
    {
      permission_key: "settings.read"
    },
    { adminId: validAdminId }
  );

  assert.equal(result.success, false);
});

test("grant permission rejects unexpected request fields", () => {
  const result = validate(
    grantAdminPermissionSchema,
    {
      permission_key: validPermissionKey,
      is_super_admin: true
    },
    { adminId: validAdminId }
  );

  assert.equal(result.success, false);
});

test("expiry update requires expires_at", () => {
  const result = validate(
    updateAdminPermissionSchema,
    {},
    {
      adminId: validAdminId,
      permissionKey: validPermissionKey
    }
  );

  assert.equal(result.success, false);
});

test("expiry update accepts null for a permanent permission", () => {
  const result = validate(
    updateAdminPermissionSchema,
    { expires_at: null },
    {
      adminId: validAdminId,
      permissionKey: validPermissionKey
    }
  );

  assert.equal(result.success, true);
});

test("expiry update rejects an invalid permission key", () => {
  const result = validate(
    updateAdminPermissionSchema,
    { expires_at: null },
    {
      adminId: validAdminId,
      permissionKey: "invalid-key"
    }
  );

  assert.equal(result.success, false);
});

test("permission revocation accepts valid administrator and permission identifiers", () => {
  const result = validate(
    revokeAdminPermissionSchema,
    {},
    {
      adminId: validAdminId,
      permissionKey: validPermissionKey
    }
  );

  assert.equal(result.success, true);
});

test("permission revocation rejects unexpected body fields", () => {
  const result = validate(
    revokeAdminPermissionSchema,
    { force: true },
    {
      adminId: validAdminId,
      permissionKey: validPermissionKey
    }
  );

  assert.equal(result.success, false);
});


const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireAdminPermission = require("../middleware/requireAdminPermission");
const validate = require("../middleware/validate");

const {
  listAdminPermissionsSchema,
  listPermissionCatalogueSchema,
  getAdminPermissionAssignmentsSchema,
  grantAdminPermissionSchema,
  updateAdminPermissionSchema,
  revokeAdminPermissionSchema
} = require("../validators/adminPermissionSchemas");

const {
  getAdministrators,
  getPermissionCatalogue,
  getAdministratorAssignments,
  grantPermission,
  updatePermissionExpiry,
  revokePermission
} = require("../controllers/adminPermissionController");

// All endpoints require an authenticated administrator.
// Individual permissions are checked on each endpoint.
router.use(authenticate);

// View administrator accounts.
router.get(
  "/administrators",
  requireAdminPermission("admin.permissions.read"),
  validate(listAdminPermissionsSchema),
  getAdministrators
);

// View the available permission catalogue.
router.get(
  "/catalogue",
  requireAdminPermission("admin.permissions.read"),
  validate(listPermissionCatalogueSchema),
  getPermissionCatalogue
);

// View permissions assigned to a particular administrator.
router.get(
  "/:adminId/permissions",
  requireAdminPermission("admin.permissions.read"),
  validate(getAdminPermissionAssignmentsSchema),
  getAdministratorAssignments
);

// Grant a permission to an administrator.
router.post(
  "/:adminId/permissions",
  requireAdminPermission("admin.permissions.manage"),
  validate(grantAdminPermissionSchema),
  grantPermission
);

// Change an existing permission's expiry date.
router.patch(
  "/:adminId/permissions/:permissionKey",
  requireAdminPermission("admin.permissions.manage"),
  validate(updateAdminPermissionSchema),
  updatePermissionExpiry
);

// Revoke an administrator's permission.
router.delete(
  "/:adminId/permissions/:permissionKey",
  requireAdminPermission("admin.permissions.manage"),
  validate(revokeAdminPermissionSchema),
  revokePermission
);

module.exports = router;


const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireSuperAdmin = require("../middleware/requireSuperAdmin");
const validate = require("../middleware/validate");

const {
  listAdminPermissionsSchema,
  listPermissionCatalogueSchema,
  getAdminAssignmentsSchema,
  grantAdminPermissionSchema,
  updateAdminPermissionSchema,
  revokeAdminPermissionSchema
} = require("../validators/adminPermissionSchemas");

const {
  getAdministrators,
  getPermissionCatalogue,
  getAdminPermissions,
  grantPermission,
  updatePermissionExpiry,
  revokePermission
} = require("../controllers/adminPermissionController");


// =====================================================
// AUTHENTICATION AND AUTHORIZATION
// =====================================================

router.use(authenticate);
router.use(requireSuperAdmin);


// =====================================================
// LIST ADMINISTRATORS
// =====================================================

router.get(
  "/administrators",
  validate(listAdminPermissionsSchema),
  getAdministrators
);


// =====================================================
// LIST AVAILABLE PERMISSIONS
// =====================================================

router.get(
  "/catalogue",
  validate(listPermissionCatalogueSchema),
  getPermissionCatalogue
);


// =====================================================
// VIEW AN ADMINISTRATOR'S PERMISSIONS
// =====================================================

router.get(
  "/:adminId/permissions",
  validate(getAdminAssignmentsSchema),
  getAdminPermissions
);


// =====================================================
// GRANT A PERMISSION
// =====================================================

router.post(
  "/:adminId/permissions",
  validate(grantAdminPermissionSchema),
  grantPermission
);


// =====================================================
// UPDATE PERMISSION EXPIRY
// =====================================================

router.patch(
  "/:adminId/permissions/:permissionKey",
  validate(updateAdminPermissionSchema),
  updatePermissionExpiry
);


// =====================================================
// REVOKE A PERMISSION
// =====================================================

router.delete(
  "/:adminId/permissions/:permissionKey",
  validate(revokeAdminPermissionSchema),
  revokePermission
);


module.exports = router;

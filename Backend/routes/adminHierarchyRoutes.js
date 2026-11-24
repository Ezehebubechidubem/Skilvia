
const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireSuperAdmin = require("../middleware/requireSuperAdmin");
const validate = require("../middleware/validate");

const {
  listAdministratorsSchema,
  createSubAdminSchema,
  updateSubAdminStatusSchema,
  getAdministratorSchema
} = require("../validators/adminHierarchySchemas");

const {
  getAdministrators,
  getAdministratorDetails,
  createSubAdministrator,
  changeSubAdministratorStatus
} = require("../controllers/adminHierarchyController");


// =====================================================
// AUTHENTICATION
// =====================================================

router.use(authenticate);

// Every endpoint in this router is restricted to
// the active super administrator.

router.use(requireSuperAdmin);


// =====================================================
// LIST ALL ADMINISTRATORS
// =====================================================

router.get(
  "/administrators",
  validate(listAdministratorsSchema),
  getAdministrators
);


// =====================================================
// CREATE A SUB-ADMINISTRATOR
// =====================================================

router.post(
  "/sub-admins",
  validate(createSubAdminSchema),
  createSubAdministrator
);


// =====================================================
// GET ADMINISTRATOR DETAILS
// =====================================================

router.get(
  "/administrators/:adminId",
  validate(getAdministratorSchema),
  getAdministratorDetails
);


// =====================================================
// UPDATE SUB-ADMINISTRATOR STATUS
// =====================================================

router.patch(
  "/sub-admins/:adminId/status",
  validate(updateSubAdminStatusSchema),
  changeSubAdministratorStatus
);


module.exports = router;

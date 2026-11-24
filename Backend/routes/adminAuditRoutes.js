
const express = require("express");
const router = express.Router();

const adminAuditController = require("../controllers/adminAuditController");

const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const validate = require("../middleware/validate");

const { apiLimiter } = require("../middleware/security");

const {
  getAdminAuditLogsSchema,
  getAdminAuditLogSchema
} = require("../validators/adminAuditSchemas");


// =====================================================
// ADMIN AUDIT ROUTES
// =====================================================

router.use(authenticate);
router.use(authorize("admin"));
router.use(apiLimiter);


// =====================================================
// GET AUDIT HISTORY
// =====================================================

router.get(
  "/",
  validate(getAdminAuditLogsSchema),
  adminAuditController.getAdminAuditLogs
);


// =====================================================
// GET ONE AUDIT RECORD
// =====================================================

router.get(
  "/:auditLogId",
  validate(getAdminAuditLogSchema),
  adminAuditController.getAdminAuditLog
);


module.exports = router;

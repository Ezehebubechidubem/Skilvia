
const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireAdminPermission = require("../middleware/requireAdminPermission");
const validate = require("../middleware/validate");

const {
  getAdminAuditLogSchema
} = require("../validators/adminAuditSchemas");

const {
  getAdminAuditLogs,
  getAdminAuditLogById
} = require("../controllers/adminAuditController");


// =====================================================
// AUTHENTICATION
// =====================================================

router.use(authenticate);


// =====================================================
// VIEW ADMIN AUDIT LOGS
// =====================================================

// GET /api/admin/audit-logs

router.get(
  "/",
  requireAdminPermission("admin.audit.read"),
  validate(getAdminAuditLogSchema),
  getAdminAuditLogs
);


// =====================================================
// VIEW A SINGLE AUDIT RECORD
// =====================================================

// GET /api/admin/audit-logs/:auditLogId

router.get(
  "/:auditLogId",
  requireAdminPermission("admin.audit.read"),
  validate(getAdminAuditLogSchema),
  getAdminAuditLogById
);


module.exports = router;

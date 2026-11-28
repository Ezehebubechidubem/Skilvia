const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireSuperAdmin = require("../middleware/requireSuperAdmin");
const validate = require("../middleware/validate");

const {
  getAdminAuditLogSchema,
  getAdminAuditLogByIdSchema
} = require("../validators/adminAuditSchemas");

const {
  getAdminAuditLogs,
  getAdminAuditLog
} = require("../controllers/adminAuditController");

// =====================================================
// AUTHENTICATION AND AUTHORIZATION
// =====================================================

router.use(authenticate);
router.use(requireSuperAdmin);

// =====================================================
// VIEW AUDIT LOGS
// =====================================================

router.get(
  "/",
  validate(getAdminAuditLogSchema),
  getAdminAuditLogs
);

// =====================================================
// VIEW ONE AUDIT LOG
// =====================================================

router.get(
  "/:auditLogId",
  validate(getAdminAuditLogByIdSchema),
  getAdminAuditLog
);

module.exports = router;
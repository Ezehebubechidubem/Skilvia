const express = require("express");
const router = express.Router();

const publicServiceController = require("../controllers/publicServiceController");

const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const {
  discoverServicesSchema,
  getPublicServiceByIdSchema
} = require("../validators/publicServiceSchemas");

// =====================================================
// PUBLIC SERVICE DISCOVERY ROUTES
// =====================================================

router.use(apiLimiter);

// =====================================================
// DISCOVER SERVICES
// =====================================================

router.get(
  "/",
  validate(discoverServicesSchema),
  publicServiceController.discoverServices
);

// =====================================================
// GET ONE PUBLIC SERVICE
// =====================================================

router.get(
  "/:serviceId",
  validate(getPublicServiceByIdSchema),
  publicServiceController.getPublicServiceById
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
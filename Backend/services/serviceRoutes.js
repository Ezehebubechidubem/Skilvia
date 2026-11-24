
const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const serviceController = require("../controllers/serviceController");

const {
  createServiceSchema,
  updateServiceSchema,
  getServiceSchema,
  deleteServiceSchema,
  listServicesSchema
} = require("../validators/serviceSchemas");

// =====================================================
// PRIVATE PROFESSIONAL SERVICE ROUTES
// =====================================================

router.use(authenticate);
router.use(apiLimiter);

// CREATE PROFESSIONAL SERVICE
router.post(
  "/",
  validate(createServiceSchema),
  serviceController.createService
);

// LIST LOGGED-IN PROFESSIONAL SERVICES
router.get(
  "/",
  validate(listServicesSchema),
  serviceController.listMyServices
);

// GET ONE OF MY SERVICES
router.get(
  "/:serviceId",
  validate(getServiceSchema),
  serviceController.getMyService
);

// UPDATE PROFESSIONAL SERVICE
router.patch(
  "/:serviceId",
  validate(updateServiceSchema),
  serviceController.updateService
);

// DEACTIVATE PROFESSIONAL SERVICE
router.delete(
  "/:serviceId",
  validate(deleteServiceSchema),
  serviceController.deleteService
);

module.exports = router;

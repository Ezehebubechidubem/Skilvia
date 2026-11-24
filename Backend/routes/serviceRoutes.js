
const express = require("express");
const router = express.Router();

const serviceController = require("../controllers/serviceController");

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");

const {
  createServiceSchema,
  updateServiceSchema,
  getServiceSchema,
  deleteServiceSchema,
  listServicesSchema
} = require("../validators/serviceSchemas");

const { apiLimiter } = require("../middleware/security");


// =====================================================
// ALL SERVICE-MANAGEMENT ROUTES REQUIRE AUTHENTICATION
// =====================================================

router.use(authenticate);
router.use(apiLimiter);


// =====================================================
// CREATE A SERVICE
// POST /api/services
// =====================================================

router.post(
  "/",
  validate(createServiceSchema),
  serviceController.createService
);


// =====================================================
// LIST MY SERVICES
// GET /api/services/my-services
// =====================================================

router.get(
  "/my-services",
  validate(listServicesSchema),
  serviceController.listMyServices
);


// =====================================================
// GET ONE OF MY SERVICES
// GET /api/services/:serviceId
// =====================================================

router.get(
  "/:serviceId",
  validate(getServiceSchema),
  serviceController.getMyService
);


// =====================================================
// UPDATE A SERVICE
// PATCH /api/services/:serviceId
// =====================================================

router.patch(
  "/:serviceId",
  validate(updateServiceSchema),
  serviceController.updateService
);


// =====================================================
// DEACTIVATE A SERVICE
// DELETE /api/services/:serviceId
// =====================================================

router.delete(
  "/:serviceId",
  validate(deleteServiceSchema),
  serviceController.deleteService
);


module.exports = router;

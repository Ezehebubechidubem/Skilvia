
const express = require("express");
const router = express.Router();

const professionalController = require("../controllers/professionalController");

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");

const {
  createProfessionalProfileSchema,
  updateProfessionalProfileSchema,
  updateAvailabilitySchema,
  getProfessionalProfileSchema
} = require("../validators/professionalSchemas");

const { apiLimiter } = require("../middleware/security");


// =====================================================
// PRIVATE PROFESSIONAL ROUTES
// =====================================================

// CREATE PROFESSIONAL PROFILE
router.post(
  "/profile",
  authenticate,
  apiLimiter,
  validate(createProfessionalProfileSchema),
  professionalController.createProfile
);


// GET LOGGED-IN PROFESSIONAL PROFILE
router.get(
  "/profile/me",
  authenticate,
  apiLimiter,
  professionalController.getMyProfile
);


// UPDATE PROFESSIONAL PROFILE
router.patch(
  "/profile",
  authenticate,
  apiLimiter,
  validate(updateProfessionalProfileSchema),
  professionalController.updateProfile
);


// UPDATE PROFESSIONAL AVAILABILITY
router.patch(
  "/profile/availability",
  authenticate,
  apiLimiter,
  validate(updateAvailabilitySchema),
  professionalController.updateAvailability
);


// =====================================================
// PUBLIC PROFESSIONAL ROUTES
// =====================================================

// GET A PUBLISHED PROFESSIONAL PROFILE
router.get(
  "/profile/:profileId",
  apiLimiter,
  validate(getProfessionalProfileSchema),
  professionalController.getPublicProfile
);


module.exports = router;

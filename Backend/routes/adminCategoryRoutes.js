
const express = require("express");
const router = express.Router();

const adminCategoryController = require("../controllers/adminCategoryController");

const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const validate = require("../middleware/validate");

const { apiLimiter } = require("../middleware/security");

const {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  deleteCategorySchema
} = require("../validators/adminCategorySchemas");


// =====================================================
// ADMIN CATEGORY ROUTES
// All routes require an authenticated administrator.
// =====================================================

router.use(authenticate);
router.use(authorize("admin"));
router.use(apiLimiter);


// =====================================================
// GET ALL CATEGORIES
// =====================================================

router.get(
  "/",
  adminCategoryController.getAllCategories
);


// =====================================================
// CREATE CATEGORY OR SUBCATEGORY
// =====================================================

router.post(
  "/",
  validate(createCategorySchema),
  adminCategoryController.createCategory
);


// =====================================================
// GET ONE CATEGORY
// =====================================================

router.get(
  "/:categoryId",
  validate(deleteCategorySchema),
  adminCategoryController.getCategoryById
);


// =====================================================
// UPDATE CATEGORY INFORMATION
// =====================================================

router.patch(
  "/:categoryId",
  validate(updateCategorySchema),
  adminCategoryController.updateCategory
);


// =====================================================
// ACTIVATE OR DEACTIVATE CATEGORY
// =====================================================

router.patch(
  "/:categoryId/status",
  validate(updateCategoryStatusSchema),
  adminCategoryController.updateCategoryStatus
);


module.exports = router;


const express = require("express");

const router = express.Router();

const authenticate = require("../middleware/authenticate");
const requireAdminPermission = require("../middleware/requireAdminPermission");
const validate = require("../middleware/validate");

const {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  deleteCategorySchema
} = require("../validators/adminCategorySchemas");

const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  updateCategoryStatus
} = require("../controllers/adminCategoryController");


// =====================================================
// AUTHENTICATION
// =====================================================

router.use(authenticate);


// =====================================================
// VIEW ALL CATEGORIES
// =====================================================

router.get(
  "/",
  requireAdminPermission("admin.categories.read"),
  getAllCategories
);


// =====================================================
// CREATE CATEGORY
// =====================================================

router.post(
  "/",
  requireAdminPermission("admin.categories.create"),
  validate(createCategorySchema),
  createCategory
);


// =====================================================
// VIEW ONE CATEGORY
// =====================================================

router.get(
  "/:categoryId",
  requireAdminPermission("admin.categories.read"),
  validate(deleteCategorySchema),
  getCategoryById
);


// =====================================================
// UPDATE CATEGORY DETAILS
// =====================================================

router.patch(
  "/:categoryId",
  requireAdminPermission("admin.categories.update"),
  validate(updateCategorySchema),
  updateCategory
);


// =====================================================
// ACTIVATE OR DEACTIVATE CATEGORY
// =====================================================

router.patch(
  "/:categoryId/status",
  requireAdminPermission("admin.categories.manage_status"),
  validate(updateCategoryStatusSchema),
  updateCategoryStatus
);


module.exports = router;

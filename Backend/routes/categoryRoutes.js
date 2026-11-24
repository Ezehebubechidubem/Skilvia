
const express = require("express");
const router = express.Router();

const categoryController = require("../controllers/categoryController");

const validate = require("../middleware/validate");
const { apiLimiter } = require("../middleware/security");

const {
  getCategoriesSchema,
  getCategoryByIdSchema,
  getSubcategoriesSchema
} = require("../validators/categorySchemas");


// =====================================================
// PUBLIC CATEGORY ROUTES
// =====================================================

router.use(apiLimiter);


// =====================================================
// GET ALL ACTIVE CATEGORIES
// =====================================================

router.get(
  "/",
  validate(getCategoriesSchema),
  categoryController.getCategories
);


// =====================================================
// GET ONE ACTIVE CATEGORY
// =====================================================

router.get(
  "/:categoryId",
  validate(getCategoryByIdSchema),
  categoryController.getCategoryById
);


// =====================================================
// GET SUBCATEGORIES
// =====================================================

router.get(
  "/:categoryId/subcategories",
  validate(getSubcategoriesSchema),
  categoryController.getSubcategories
);


module.exports = router;

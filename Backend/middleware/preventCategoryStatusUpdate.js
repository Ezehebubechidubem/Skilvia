
const preventCategoryStatusUpdate = (req, res, next) => {
  const body = req.validated?.body || req.body || {};

  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    return res.status(400).json({
      success: false,
      message:
        "Category status cannot be changed through the update endpoint. Use the category status endpoint instead."
    });
  }

  return next();
};

module.exports = preventCategoryStatusUpdate;

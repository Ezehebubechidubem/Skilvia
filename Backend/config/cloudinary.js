const cloudinary = require("cloudinary").v2;

const env = require("./environment");


// =====================================================
// CLOUDINARY CONFIGURATION
// =====================================================

const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true
  });
}


// =====================================================
// CONFIGURATION VALIDATION
// =====================================================

const assertCloudinaryConfigured = () => {
  if (!cloudinaryConfigured) {
    const error = new Error(
      "Cloudinary is not configured. Check the Cloudinary environment variables."
    );

    error.statusCode = 503;
    error.code = "CLOUDINARY_NOT_CONFIGURED";

    throw error;
  }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  cloudinary,
  cloudinaryConfigured,
  assertCloudinaryConfigured
};
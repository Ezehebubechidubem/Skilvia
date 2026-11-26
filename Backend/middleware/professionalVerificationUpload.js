
const multer = require("multer");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error(
      "Unsupported document format. Upload a JPG, JPEG, PNG, WebP or PDF file."
    );

    error.code = "UNSUPPORTED_VERIFICATION_FILE_TYPE";
    error.statusCode = 400;

    return callback(error);
  }

  return callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 1024,
    fieldNameSize: 100
  }
});

const receiveVerificationDocument = (req, res, next) => {
  upload.single("document")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Document exceeds the maximum allowed size of 10 MB."
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,
          message: "Only one document is allowed in the document field."
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid document upload request."
      });
    }

    if (error.code === "UNSUPPORTED_VERIFICATION_FILE_TYPE") {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return next(error);
  });
};

module.exports = {
  receiveVerificationDocument,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
};

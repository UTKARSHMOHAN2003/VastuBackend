const multer = require("multer");

// Use memory storage for database storage (already correct)
const storage = multer.memoryStorage();

// Allowed MIME types (images + documents)
const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg", // Added for better compatibility
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp", // Added BMP support
  "image/tiff", // Added TIFF support
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/octet-stream", // fallback for some clients
];

// Enhanced file filter with better validation
const fileFilter = (req, file, cb) => {
  console.log(
    `Processing file: ${file.originalname}, MIME type: ${file.mimetype}, Size: ${file.size} bytes`
  );

  // Check file extension
  const extOk = /\.(jpe?g|png|gif|webp|svg|bmp|tiff?|pdf|csv|xlsx?|xls)$/i.test(
    file.originalname
  );

  // Check MIME type
  const mimeOk = allowedMimeTypes.includes(file.mimetype);

  if (mimeOk || extOk) {
    // Additional validation for file size during filter (optional)
    if (file.size && file.size > 10 * 1024 * 1024) {
      return cb(
        new Error(
          `File ${file.originalname} is too large. Maximum size is 10MB.`
        ),
        false
      );
    }

    console.log(`✅ File accepted: ${file.originalname}`);
    cb(null, true);
  } else {
    console.error(
      `❌ File rejected: ${file.originalname} (MIME: ${file.mimetype})`
    );
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed types: images (jpg, png, gif, webp, svg, bmp, tiff), PDF, CSV, Excel files (xls, xlsx)`
      ),
      false
    );
  }
};

// Enhanced multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5, // Maximum 5 files per request (as per your requirement)
    fieldSize: 10 * 1024 * 1024, // 10MB field size
    headerPairs: 2000, // Increase if needed
  },
  fileFilter: fileFilter,
});

// Enhanced error handler middleware
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = "File upload error";
    let details = error.message;

    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        message = "File too large";
        details = "Each file must be smaller than 10MB";
        break;
      case "LIMIT_FILE_COUNT":
        message = "Too many files";
        details = "Maximum 5 files allowed per upload";
        break;
      case "LIMIT_UNEXPECTED_FILE":
        message = "Unexpected file field";
        details = "Please use the correct file field name";
        break;
      case "LIMIT_PART_COUNT":
        message = "Too many form parts";
        details = "Request has too many parts";
        break;
      default:
        details = error.message;
    }

    return res.status(400).json({
      success: false,
      message,
      error: details,
      code: error.code,
    });
  }

  // Handle custom file filter errors
  if (error.message.includes("Unsupported file type")) {
    return res.status(400).json({
      success: false,
      message: "Invalid file type",
      error: error.message,
    });
  }

  next(error);
};

// Validation middleware for file uploads
const validateFileUpload = (req, res, next) => {
  console.log("=== FILE UPLOAD VALIDATION ===");
  console.log("Files received:", req.files ? req.files.length : 0);
  console.log("Body:", req.body);

  // Check if files were uploaded
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No files uploaded",
      error: "Please select at least one file to upload",
    });
  }

  // Check file count (max 5)
  if (req.files.length > 5) {
    return res.status(400).json({
      success: false,
      message: "Too many files",
      error: `Maximum 5 files allowed. You uploaded ${req.files.length} files.`,
    });
  }

  // Validate each file
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];

    // Check if file has content
    if (!file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Empty file detected",
        error: `File "${file.originalname}" is empty or corrupted`,
      });
    }

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File too large",
        error: `File "${file.originalname}" exceeds 10MB limit`,
      });
    }

    console.log(
      `✅ File ${i + 1} validated: ${file.originalname} (${(
        file.size /
        1024 /
        1024
      ).toFixed(2)}MB)`
    );
  }

  next();
};

// Export different upload configurations
module.exports = {
  // For single file upload
  single: (fieldName = "file") => upload.single(fieldName),

  // For multiple files upload (same field name) - THIS IS WHAT YOU NEED
  array: (fieldName = "files", maxCount = 5) =>
    upload.array(fieldName, maxCount),

  // For multiple files with different field names
  fields: (fields) => upload.fields(fields),

  // For any files
  any: () => upload.any(),

  // Raw upload object
  upload: upload,

  // Middleware exports
  handleMulterError,
  validateFileUpload,

  // Helper function to get file info
  getFileInfo: (file) => ({
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    sizeFormatted: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
    buffer: file.buffer,
    hasBuffer: !!file.buffer,
    bufferSize: file.buffer ? file.buffer.length : 0,
  }),
};

const multer = require("multer");

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// Allowed MIME types (images + pdf + csv + excel)
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/octet-stream", // fallback for some clients that post xlsx as octet-stream
];

// File filter to accept images + pdf + csv + xls/xlsx
const fileFilter = (req, file, cb) => {
  const extOk = /\.(jpg|jpeg|png|gif|webp|svg|pdf|csv|xls|xlsx)$/i.test(
    file.originalname
  );
  if (allowedMimeTypes.includes(file.mimetype) || extOk) {
    cb(null, true);
  } else {
    cb(
      new Error("Unsupported file type. Allowed: images, pdf, csv, xls, xlsx"),
      false
    );
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (increase for larger docs if needed)
  },
  fileFilter: fileFilter,
});

module.exports = upload;

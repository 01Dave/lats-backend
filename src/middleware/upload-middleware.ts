import multer from "multer";

// FR-22: PDF, JPG, PNG only. Kept in memory (not disk) here — the route
// handler passes the buffer straight to file-storage.ts, which decides
// the actual on-disk path; multer never writes to disk itself.
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const uploadSingleDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only PDF, JPG, and PNG files are accepted"));
      return;
    }
    cb(null, true);
  },
}).single("file");

import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth";
import { uploadPhoto } from "../controllers/upload.controller";

// Files are kept in memory and then written to the database-backed file store
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

const router = Router();

router.post("/profile-photo", authenticate, upload.single("photo"), uploadPhoto);

export default router;

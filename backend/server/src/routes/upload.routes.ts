import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { authenticate } from "../middleware/auth";
import { uploadPhoto } from "../controllers/upload.controller";

const uploadsDir = path.resolve(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
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

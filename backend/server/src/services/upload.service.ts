import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Upload profile photo
// ---------------------------------------------------------------------------

async function uploadProfilePhoto(
  userId: string,
  file: Express.Multer.File
): Promise<string> {
  if (!file) {
    throw new AppError("No file provided", 400, "BAD_REQUEST");
  }

  // Build URL path for the uploaded file
  const fileUrl = `/uploads/${file.filename}`;

  // Update user profile photo in DB
  await prisma.user.update({
    where: { id: userId },
    data: { profilePhoto: fileUrl },
  });

  return fileUrl;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const uploadService = {
  uploadProfilePhoto,
};

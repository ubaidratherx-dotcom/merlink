import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { fileStoreService } from "./fileStore.service";

// ---------------------------------------------------------------------------
// Upload profile photo
// ---------------------------------------------------------------------------

async function uploadProfilePhoto(
  userId: string,
  file: Express.Multer.File
): Promise<string> {
  if (!file || !file.buffer) {
    throw new AppError("No file provided", 400, "BAD_REQUEST");
  }

  const fileUrl = await fileStoreService.save(file.buffer, file.mimetype);

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

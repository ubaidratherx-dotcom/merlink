import { Request, Response, NextFunction } from "express";
import { uploadService } from "../services/upload.service";

export async function uploadPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;

    if (!req.file) {
      res.status(400).json({
        error: { message: "No file uploaded", code: "BAD_REQUEST" },
      });
      return;
    }

    const url = await uploadService.uploadProfilePhoto(userId, req.file);
    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
}

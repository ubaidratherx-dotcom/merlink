import { Request, Response, NextFunction } from "express";
import { emailService } from "../services/email.service";
import { prisma } from "../lib/prisma";

export async function sendVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || !user.email) {
      res.status(400).json({
        error: { message: "No email address associated with this account", code: "BAD_REQUEST" },
      });
      return;
    }

    const result = await emailService.sendVerificationEmail(userId, user.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({
        error: { message: "Verification token is required", code: "BAD_REQUEST" },
      });
      return;
    }

    const result = await emailService.verifyEmail(token);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

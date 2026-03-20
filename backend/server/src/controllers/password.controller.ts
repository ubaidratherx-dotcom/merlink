import { Request, Response, NextFunction } from "express";
import { passwordService } from "../services/password.service";

export async function requestReset(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        error: { message: "Email is required", code: "BAD_REQUEST" },
      });
      return;
    }

    const result = await passwordService.requestPasswordReset(email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({
        error: { message: "Token and new password are required", code: "BAD_REQUEST" },
      });
      return;
    }

    const result = await passwordService.resetPassword(token, newPassword);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

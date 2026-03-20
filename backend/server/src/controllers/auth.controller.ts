import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { prisma } from "../lib/prisma";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function loginEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.loginWithEmail(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function loginPhone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { phone } = req.body;
    const result = await authService.loginWithPhone(phone);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function sendOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { phone } = req.body;
    const result = await authService.sendOtp(phone);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { phone, code } = req.body;
    const result = await authService.verifyOtp(phone, code);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ success: true, data: { message: "Logged out successfully" } });
  } catch (error) {
    next(error);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: "User not found", code: "NOT_FOUND" },
      });
      return;
    }
    res.json({ success: true, data: authService.sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/**
 * Middleware that requires the authenticated user to have completed KYC verification.
 * Must be used after the `authenticate` middleware.
 */
export async function requireKyc(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;

  if (!userId) {
    res
      .status(401)
      .json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });

  if (!user) {
    res
      .status(404)
      .json({ error: { message: "User not found", code: "NOT_FOUND" } });
    return;
  }

  if (user.kycStatus !== "VERIFIED") {
    res
      .status(403)
      .json({ error: { message: "KYC verification required", code: "KYC_REQUIRED" } });
    return;
  }

  next();
}

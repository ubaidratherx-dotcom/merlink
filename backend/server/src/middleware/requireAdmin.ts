import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

// Admin wallet address — must match the escrow program admin
const ADMIN_WALLET = "EJhPhzqWsNvwuWBTpyUViuuc5Gh2AwiYEwSCT7rzHnuJ";

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });

  if (!user?.walletAddress || user.walletAddress !== ADMIN_WALLET) {
    res.status(403).json({ error: { message: "Admin access required", code: "FORBIDDEN" } });
    return;
  }

  next();
}

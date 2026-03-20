import { Request, Response, NextFunction } from "express";
import { walletService } from "../services/wallet.service";
import { prisma } from "../lib/prisma";

export async function verifyWallet(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { walletAddress, signature, message } = req.body;
    const result = await walletService.verifyAndConnect(
      userId,
      walletAddress,
      signature,
      message
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function disconnectWallet(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await walletService.disconnectWallet(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getBalance(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.walletAddress || !user.walletVerified) {
      res.status(400).json({
        success: false,
        error: {
          message: "No verified wallet connected",
          code: "BAD_REQUEST",
        },
      });
      return;
    }

    const balance = await walletService.getWalletBalance(user.walletAddress);
    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
}

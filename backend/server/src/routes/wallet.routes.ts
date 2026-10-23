import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { verifyWalletSchema, disconnectWalletSchema } from "../validators/wallet.validator";
import {
  verifyWallet,
  disconnectWallet,
  getBalance,
} from "../controllers/wallet.controller";

const router = Router();

router.post("/verify", authenticate, validate({ body: verifyWalletSchema }), verifyWallet);
router.post("/disconnect", authenticate, validate({ body: disconnectWalletSchema }), disconnectWallet);
router.get("/balance", authenticate, getBalance);

// ETH wallet endpoints
router.post("/eth/verify", authenticate, async (req, res, next) => {
  try {
    const { walletService } = await import("../services/wallet.service");
    const user = await walletService.verifyAndConnectEth(
      req.user!.userId,
      req.body.walletAddress,
      req.body.signature,
      req.body.message
    );
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

router.post("/eth/disconnect", authenticate, async (req, res, next) => {
  try {
    const { walletService } = await import("../services/wallet.service");
    const user = await walletService.disconnectEthWallet(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

router.get("/eth/balance", authenticate, async (req, res, next) => {
  try {
    const { walletService } = await import("../services/wallet.service");
    const user = await import("../lib/prisma").then(m => m.prisma.user.findUnique({ where: { id: req.user!.userId } }));
    if (!user?.ethWalletAddress) {
      res.json({ success: true, data: { eth: 0, usdc: 0, usdt: 0 } });
      return;
    }
    const balance = await walletService.getEthBalance(user.ethWalletAddress);
    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
});

// BTC wallet endpoints
router.post("/btc/connect", authenticate, async (req, res, next) => {
  try {
    const { btcAddress, btcPubkey } = req.body;
    if (!btcAddress || !btcPubkey) {
      res.status(400).json({ error: { message: "btcAddress and btcPubkey required", code: "MISSING_FIELDS" } });
      return;
    }

    // Check if already connected to another user
    const existing = await import("../lib/prisma").then(m =>
      m.prisma.user.findUnique({ where: { btcAddress } })
    );
    if (existing && existing.id !== req.user!.userId) {
      res.status(409).json({ error: { message: "BTC address already connected to another account", code: "CONFLICT" } });
      return;
    }

    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { btcAddress, btcPubkey },
    });

    const { passwordHash, ...sanitized } = user as any;
    res.json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
});

router.post("/btc/disconnect", authenticate, async (req, res, next) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { btcAddress: null, btcPubkey: null },
    });
    const { passwordHash, ...sanitized } = user as any;
    res.json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
});

router.get("/btc/balance", authenticate, async (req, res, next) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.btcAddress) {
      res.json({ success: true, data: { btc: 0 } });
      return;
    }
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const balance = await btcEscrowService.getBalance(user.btcAddress);
    res.json({ success: true, data: { btc: balance } });
  } catch (error) {
    next(error);
  }
});

export default router;

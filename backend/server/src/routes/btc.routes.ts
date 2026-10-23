import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "btc", status: "ok" });
});

// Create multisig escrow address for a trade
router.post("/escrow/create", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { tradeId, sellerBtcPubkey, buyerBtcPubkey } = req.body;

    // Validate pubkeys: must be 33-byte compressed (66 hex chars)
    const hexRegex = /^[0-9a-fA-F]{66}$/;
    if (!tradeId || !sellerBtcPubkey || !buyerBtcPubkey) {
      return res.status(400).json({ success: false, error: "tradeId, sellerBtcPubkey, buyerBtcPubkey required" });
    }
    if (!hexRegex.test(sellerBtcPubkey) || !hexRegex.test(buyerBtcPubkey)) {
      return res.status(400).json({ success: false, error: "Invalid pubkey: must be 33-byte compressed (66 hex chars)" });
    }

    const result = await btcEscrowService.createEscrow(tradeId, sellerBtcPubkey, buyerBtcPubkey);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Check deposit status for an escrow address
router.get("/escrow/deposit/:address", async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const deposit = await btcEscrowService.checkDeposit(req.params.address);
    res.json({ success: true, data: deposit });
  } catch (error) {
    next(error);
  }
});

// Build PSBT for release (seller will sign, then admin co-signs)
router.post("/escrow/build-release", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { prisma } = await import("../lib/prisma");
    const { tradeId, recipientAddress } = req.body;
    if (!tradeId || !recipientAddress) {
      return res.status(400).json({ success: false, error: "tradeId and recipientAddress required" });
    }
    // Verify caller is a trade participant
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    const callerId = (req as any).user?.userId;
    if (!trade || (trade.sellerId !== callerId && trade.buyerId !== callerId)) {
      return res.status(403).json({ success: false, error: "Not authorized for this trade" });
    }
    const result = await btcEscrowService.buildReleasePSBT(tradeId, recipientAddress);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin co-signs and broadcasts a seller-signed PSBT (validates trade ownership + outputs)
router.post("/escrow/cosign-broadcast", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { tradeId, psbtBase64 } = req.body;
    if (!tradeId || !psbtBase64) {
      return res.status(400).json({ success: false, error: "tradeId and psbtBase64 required" });
    }
    const txid = await btcEscrowService.adminCoSignAndBroadcast(tradeId, psbtBase64, (req as any).user.userId);
    res.json({ success: true, data: { txid } });
  } catch (error) {
    next(error);
  }
});

// Build cancel PSBT (refund to seller)
router.post("/escrow/build-cancel", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ success: false, error: "tradeId required" });
    const result = await btcEscrowService.buildCancelPSBT(tradeId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Build dispute claim PSBT (winner only)
router.post("/escrow/build-dispute-claim", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ success: false, error: "tradeId required" });
    const result = await btcEscrowService.buildDisputeReleasePSBT(tradeId, (req as any).user.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin co-signs cancel PSBT and broadcasts (refund to seller)
router.post("/escrow/cosign-cancel", authenticate, async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const { tradeId, psbtBase64 } = req.body;
    if (!tradeId || !psbtBase64) return res.status(400).json({ success: false, error: "tradeId and psbtBase64 required" });
    const txid = await btcEscrowService.adminCoSignCancel(tradeId, psbtBase64, (req as any).user.userId);
    res.json({ success: true, data: { txid } });
  } catch (error) {
    next(error);
  }
});

// Get BTC balance of an address
router.get("/balance/:address", async (req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const balance = await btcEscrowService.getBalance(req.params.address);
    res.json({ success: true, data: { btc: balance } });
  } catch (error) {
    next(error);
  }
});

// Get admin public key (for client-side multisig generation)
router.get("/admin-pubkey", async (_req, res, next) => {
  try {
    const { btcEscrowService } = await import("../services/btc-escrow.service");
    const pubkey = btcEscrowService.getAdminPubkey();
    res.json({ success: true, data: { pubkey: Buffer.from(pubkey).toString("hex") } });
  } catch (error) {
    next(error);
  }
});

export default router;

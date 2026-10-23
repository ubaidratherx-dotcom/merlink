import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireKyc } from "../middleware/requireKyc";
import * as tradeCtrl from "../controllers/trade.controller";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "trades", status: "ok" });
});

// Create a new trade (buyer picks listing, or seller accepts buy request)
router.post("/", authenticate, requireKyc, tradeCtrl.createTrade);

// Get count of trades requiring user action (for badge)
router.get("/pending-count", authenticate, async (req, res, next) => {
  try {
    const { tradeService } = await import("../services/trade.service");
    const count = await tradeService.getPendingActionCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

// List authenticated user's trades (as buyer + seller)
router.get("/", authenticate, tradeCtrl.getUserTrades);

// Get single trade detail
router.get("/:id", authenticate, tradeCtrl.getTradeById);

// Seller confirms escrow is locked on-chain
router.post("/:id/escrow", authenticate, requireKyc, tradeCtrl.confirmEscrowLocked);

// Buyer marks fiat payment as sent
router.post("/:id/payment-sent", authenticate, requireKyc, tradeCtrl.markPaymentSent);

// Seller confirms and releases escrow
router.post("/:id/release", authenticate, requireKyc, tradeCtrl.confirmRelease);

// Cancel trade (only before payment marked sent)
router.post("/:id/cancel", authenticate, tradeCtrl.cancelTrade);

// Open a dispute
router.post("/:id/dispute", authenticate, requireKyc, tradeCtrl.openDispute);

export default router;

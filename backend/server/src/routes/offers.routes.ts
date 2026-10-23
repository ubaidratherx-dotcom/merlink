import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireKyc } from "../middleware/requireKyc";
import * as offerCtrl from "../controllers/offer.controller";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "offers", status: "ok" });
});

// POST / — Create an offer on a buy request (seller)
router.post("/", authenticate, requireKyc, offerCtrl.createOffer);

// GET /buy-request/:buyRequestId — Get all offers for a buy request
router.get("/buy-request/:buyRequestId", authenticate, offerCtrl.getOffersForBuyRequest);

// POST /:offerId/accept — Accept an offer (buyer)
router.post("/:offerId/accept", authenticate, offerCtrl.acceptOffer);

// POST /:offerId/decline — Decline an offer (buyer)
router.post("/:offerId/decline", authenticate, offerCtrl.declineOffer);

export default router;

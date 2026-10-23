import { Router } from "express";
import { authenticate, optionalAuth } from "../middleware/auth";
import { requireKyc } from "../middleware/requireKyc";
import { validate } from "../middleware/validate";
import {
  createBuyRequestSchema,
  getBuyRequestsQuerySchema,
  buyRequestParamsSchema,
} from "../validators/buyRequest.validator";
import * as buyRequestCtrl from "../controllers/buyRequest.controller";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "buy-requests", status: "ok" });
});

// POST / — Create buy request (requires auth + KYC)
router.post(
  "/",
  authenticate,
  requireKyc,
  validate({ body: createBuyRequestSchema }),
  buyRequestCtrl.createBuyRequest
);

// GET /mine — Authenticated user's buy requests (must come before /:id)
router.get("/mine", authenticate, buyRequestCtrl.getMyBuyRequests);

// GET /:id — Single buy request detail
router.get(
  "/:id",
  validate({ params: buyRequestParamsSchema }),
  buyRequestCtrl.getBuyRequestById
);

// DELETE /:id — Cancel buy request
router.delete(
  "/:id",
  authenticate,
  validate({ params: buyRequestParamsSchema }),
  buyRequestCtrl.cancelBuyRequest
);

// GET / — Public discovery feed with optional location filtering
router.get(
  "/",
  optionalAuth,
  validate({ query: getBuyRequestsQuerySchema }),
  buyRequestCtrl.getBuyRequests
);

export default router;

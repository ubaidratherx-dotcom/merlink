import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { reviewService } from "../services/review.service";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "reviews", status: "ok" });
});

// Create a review for a completed trade
router.post("/", authenticate, async (req, res, next) => {
  try {
    const { tradeId, rating, comment } = req.body;
    if (!tradeId || !rating) {
      return res.status(400).json({ success: false, error: "tradeId and rating required" });
    }
    const review = await reviewService.createReview(
      tradeId,
      (req as any).user.userId,
      Number(rating),
      comment
    );
    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

// Get reviews for a trade
router.get("/trade/:tradeId", authenticate, async (req, res, next) => {
  try {
    const reviews = await reviewService.getTradeReviews(req.params.tradeId);
    res.json({ success: true, data: reviews });
  } catch (error) {
    next(error);
  }
});

// Check if current user has reviewed a trade
router.get("/check/:tradeId", authenticate, async (req, res, next) => {
  try {
    const reviewed = await reviewService.hasReviewed(req.params.tradeId, (req as any).user.userId);
    res.json({ success: true, data: { reviewed } });
  } catch (error) {
    next(error);
  }
});

export default router;

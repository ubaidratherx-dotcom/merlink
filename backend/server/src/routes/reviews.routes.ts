// Review routes – post-trade reviews and ratings
import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "reviews", status: "ok" });
});

export default router;

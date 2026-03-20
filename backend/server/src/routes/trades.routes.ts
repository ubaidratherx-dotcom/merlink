// Trade routes – trade lifecycle management
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireKyc } from "../middleware/requireKyc";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "trades", status: "ok" });
});

// POST/PUT/DELETE routes require authentication and KYC verification
router.post("/", authenticate, requireKyc, (_req, res) => {
  res.status(501).json({ error: { message: "Not implemented", code: "NOT_IMPLEMENTED" } });
});

router.put("/:id", authenticate, requireKyc, (_req, res) => {
  res.status(501).json({ error: { message: "Not implemented", code: "NOT_IMPLEMENTED" } });
});

router.delete("/:id", authenticate, requireKyc, (_req, res) => {
  res.status(501).json({ error: { message: "Not implemented", code: "NOT_IMPLEMENTED" } });
});

export default router;

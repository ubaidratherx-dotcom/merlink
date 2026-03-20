// Chat routes – trade chat history / REST fallback
import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "chat", status: "ok" });
});

export default router;

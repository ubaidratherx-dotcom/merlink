import { Router } from "express";
import { runAllJobs } from "../jobs";

const router = Router();

/**
 * Runs the background maintenance jobs. Intended for Vercel Cron (which sends
 * `Authorization: Bearer <CRON_SECRET>`) or any scheduler holding the secret.
 */
async function handleRun(req: any, res: any, next: any) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = (req.headers["authorization"] as string | undefined) || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : (req.headers["x-cron-secret"] as string | undefined);
    if (!secret || provided !== secret) {
      res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
      return;
    }
    const result = await runAllJobs();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

router.get("/run", handleRun);
router.post("/run", handleRun);

export default router;

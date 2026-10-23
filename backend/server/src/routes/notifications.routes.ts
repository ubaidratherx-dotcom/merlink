import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { notificationService } from "../services/notification.service";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "notifications", status: "ok" });
});

// GET / — get recent notifications
router.get("/", authenticate, async (req, res, next) => {
  try {
    const notifications = await notificationService.getRecent(req.user!.userId);
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
});

// GET /unread-count
router.get("/unread-count", authenticate, async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

// POST /mark-read — mark all as read
router.post("/mark-read", authenticate, async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;

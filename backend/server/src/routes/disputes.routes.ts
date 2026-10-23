import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import * as disputeCtrl from "../controllers/dispute.controller";
import multer from "multer";
import { fileStoreService } from "../services/fileStore.service";

// Multer for evidence screenshots (kept in memory, then saved to the file store)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "disputes", status: "ok" });
});

// Get dispute details for a trade (buyer/seller)
router.get("/trade/:tradeId", authenticate, disputeCtrl.getDispute);

// Upload evidence screenshot
router.post(
  "/:disputeId/evidence",
  authenticate,
  upload.single("screenshot"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({ error: { message: "No file uploaded", code: "NO_FILE" } });
      return;
    }
    try {
      req.body.type = "screenshot";
      req.body.content = await fileStoreService.save(req.file.buffer, req.file.mimetype);
      next();
    } catch (err) {
      next(err);
    }
  },
  disputeCtrl.uploadEvidence
);

// Upload text evidence
router.post("/:disputeId/evidence/text", authenticate, (req, res, next) => {
  req.body.type = "text";
  next();
}, disputeCtrl.uploadEvidence);

// Admin: list open disputes
router.get("/admin/open", authenticate, requireAdmin, disputeCtrl.getOpenDisputes);

// Admin: resolve dispute
router.post("/admin/:disputeId/resolve", authenticate, requireAdmin, disputeCtrl.resolveDispute);

// Admin: send chat message in disputed trade
router.post("/admin/:tradeId/chat", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { chatService } = await import("../services/chat.service");
    const { io } = await import("../socket/index");
    const message = await chatService.sendAdminMessage(req.params.tradeId, req.user!.userId, req.body.content);

    // Broadcast via Socket.io
    const chatNs = io?.of("/chat");
    if (chatNs) {
      chatNs.to(`chat:${req.params.tradeId}`).emit("new-message", message);
    }
    // Also broadcast on trade namespace for layout notifications
    const tradeNs = io?.of("/trade");
    if (tradeNs) {
      tradeNs.emit("new-message", { tradeId: req.params.tradeId, message });
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

export default router;

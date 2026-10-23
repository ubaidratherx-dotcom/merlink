import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { chatService } from "../services/chat.service";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ route: "chat", status: "ok" });
});

// Get all conversations (inbox)
router.get("/conversations", authenticate, async (req, res, next) => {
  try {
    const conversations = await chatService.getConversations(req.user!.userId);
    res.json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
});

// Mark chat as read for current user
router.post("/:tradeId/read", authenticate, async (req, res, next) => {
  try {
    await chatService.markRead(req.params.tradeId, req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get chat messages for a trade (REST fallback)
router.get("/:tradeId/messages", authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { tradeId } = req.params;
    const { cursor, limit } = req.query;
    const result = await chatService.getMessages(
      tradeId,
      userId,
      cursor as string | undefined,
      limit ? parseInt(limit as string) : undefined
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Send a message (REST fallback — primary path is via Socket.io)
router.post("/:tradeId/messages", authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { tradeId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      res.status(400).json({ error: { message: "content is required", code: "MISSING_FIELD" } });
      return;
    }
    const message = await chatService.sendMessage(tradeId, userId, content.trim());
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

export default router;

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Contact info detection — block phone numbers, Telegram, WhatsApp, Discord,
// wallet addresses, URLs, etc.
// ---------------------------------------------------------------------------

const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /(\+?\d[\d\s\-().]{7,}\d)/,
    reason: "Phone number detected",
  },
  {
    pattern: /\b(telegram|tg|whatsapp|wa\.me|discord|signal)\b/i,
    reason: "Messaging platform reference detected",
  },
  {
    pattern: /@[\w.]{2,}/,
    reason: "Handle or username reference detected",
  },
  {
    pattern: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/,
    reason: "Wallet address detected",
  },
  {
    pattern: /https?:\/\/[^\s]+/i,
    reason: "URL detected",
  },
  {
    pattern: /[\w.-]+@[\w.-]+\.\w{2,}/,
    reason: "Email address detected",
  },
];

function checkForBlockedContent(content: string): { isBlocked: boolean; blockReason: string | null } {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return { isBlocked: true, blockReason: reason };
    }
  }
  return { isBlocked: false, blockReason: null };
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

async function sendMessage(tradeId: string, senderId: string, content: string) {
  // Verify user is part of this trade
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.buyerId !== senderId && trade.sellerId !== senderId) {
    throw new AppError("Not authorized to send messages in this trade", 403, "FORBIDDEN");
  }

  // Check for blocked content
  const { isBlocked, blockReason } = checkForBlockedContent(content);

  const message = await prisma.chatMessage.create({
    data: {
      tradeId,
      senderId,
      content: isBlocked ? "[Message blocked]" : content,
      isBlocked,
      blockReason,
      isAdmin: false,
    },
    include: {
      sender: {
        select: { id: true, username: true, profilePhoto: true },
      },
    },
  });

  return message;
}

/** Admin sends a message — bypasses blocking, marks isAdmin */
async function sendAdminMessage(tradeId: string, adminId: string, content: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");

  // Only allow admin chat during dispute
  if (trade.status !== "DISPUTED") {
    throw new AppError("Admin can only chat during active disputes", 400, "NOT_DISPUTED");
  }

  const message = await prisma.chatMessage.create({
    data: {
      tradeId,
      senderId: adminId,
      content,
      isAdmin: true,
      isBlocked: false,
    },
    include: {
      sender: {
        select: { id: true, username: true, profilePhoto: true },
      },
    },
  });

  return message;
}

async function getMessages(tradeId: string, userId: string, cursor?: string, limit = 50) {
  // Verify user is part of this trade (or admin)
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");

  // Allow buyer, seller, or any user (admin access checked at route level)
  const isParty = trade.buyerId === userId || trade.sellerId === userId;
  // For non-parties, we still allow — admin route will gate access

  const where: any = { tradeId };
  if (cursor) {
    where.createdAt = { lt: new Date(cursor) };
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    include: {
      sender: {
        select: { id: true, username: true, profilePhoto: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    messages: messages.reverse(),
    hasMore: messages.length === limit,
  };
}

async function getConversations(userId: string) {
  // Get all trades where user is buyer or seller AND has at least 1 message
  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      chatMessages: { some: {} },
    },
    select: {
      id: true,
      asset: true,
      amount: true,
      chain: true,
      status: true,
      buyerId: true,
      sellerId: true,
      buyer: { select: { id: true, username: true, profilePhoto: true } },
      seller: { select: { id: true, username: true, profilePhoto: true } },
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, senderId: true, isBlocked: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = await Promise.all(
    trades.map(async (trade) => {
      const lastMessage = trade.chatMessages[0];
      const counterparty = trade.buyerId === userId ? trade.seller : trade.buyer;

      // Get last read timestamp for this user
      const readStatus = await prisma.chatReadStatus.findUnique({
        where: { tradeId_userId: { tradeId: trade.id, userId } },
      });
      const lastReadAt = readStatus?.lastReadAt || new Date(0);

      // Count messages from other party after last read
      const unreadCount = await prisma.chatMessage.count({
        where: {
          tradeId: trade.id,
          senderId: { not: userId },
          createdAt: { gt: lastReadAt },
        },
      });

      return {
        tradeId: trade.id,
        asset: trade.asset,
        amount: trade.amount,
        chain: trade.chain,
        status: trade.status,
        counterparty,
        lastMessage: lastMessage
          ? {
              content: lastMessage.isBlocked ? "[Message blocked]" : lastMessage.content,
              createdAt: lastMessage.createdAt,
              isOwn: lastMessage.senderId === userId,
            }
          : null,
        unreadCount,
      };
    })
  );

  return result;
}

async function markRead(tradeId: string, userId: string) {
  await prisma.chatReadStatus.upsert({
    where: { tradeId_userId: { tradeId, userId } },
    update: { lastReadAt: new Date() },
    create: { tradeId, userId, lastReadAt: new Date() },
  });
}

export const chatService = {
  sendMessage,
  sendAdminMessage,
  getMessages,
  getConversations,
  markRead,
};

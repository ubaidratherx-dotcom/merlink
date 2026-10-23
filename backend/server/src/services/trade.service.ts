import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { io } from "../socket/index";
import {
  PROTOCOL_FEE_PERCENTAGE,
  PAYMENT_DEADLINE_HOURS,
  SELLER_CONFIRMATION_HOURS,
} from "@merlink/types";
import type { TradeStatus } from "@prisma/client";
import { notificationService } from "./notification.service";

// ---------------------------------------------------------------------------
// Valid state transitions
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  CREATED: ["ESCROW_LOCKED", "CANCELLED"],
  ESCROW_LOCKED: ["PAYMENT_MARKED_SENT", "CANCELLED", "DISPUTED"],
  PAYMENT_PENDING: ["PAYMENT_MARKED_SENT", "CANCELLED", "DISPUTED"],
  PAYMENT_MARKED_SENT: ["RELEASE_PENDING", "COMPLETED", "DISPUTED"],
  RELEASE_PENDING: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["RESOLVED"],
  RESOLVED: [],
};

function assertTransition(from: TradeStatus, to: TradeStatus) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(
      `Invalid trade transition: ${from} -> ${to}`,
      400,
      "INVALID_TRANSITION"
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function transitionTrade(
  tradeId: string,
  toStatus: TradeStatus,
  changedBy: string,
  reason?: string,
  extra?: Record<string, unknown>
) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");

  assertTransition(trade.status, toStatus);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTrade = await tx.trade.update({
      where: { id: tradeId },
      data: { status: toStatus, ...extra },
      include: {
        buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        listing: true,
      },
    });

    await tx.tradeStateLog.create({
      data: {
        tradeId,
        fromStatus: trade.status,
        toStatus,
        changedBy,
        reason,
      },
    });

    return updatedTrade;
  });

  // Emit real-time update — broadcast to all connected clients
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs.emit("trade-update", {
      tradeId,
      status: toStatus,
      trade: updated,
    });
  }

  // Store DB notifications for buyer + seller
  const statusMessages: Record<string, { title: string; notify: "buyer" | "seller" | "both" }> = {
    ESCROW_LOCKED: { title: `Escrow locked! Send your payment for ${updated.amount} ${updated.asset}`, notify: "buyer" },
    PAYMENT_MARKED_SENT: { title: `Payment marked as sent for ${updated.amount} ${updated.asset} — please confirm`, notify: "seller" },
    COMPLETED: { title: `Trade completed! ${updated.amount} ${updated.asset}`, notify: "both" },
    CANCELLED: { title: `Trade cancelled: ${updated.amount} ${updated.asset}`, notify: "both" },
    DISPUTED: { title: `Trade disputed: ${updated.amount} ${updated.asset}`, notify: "both" },
  };

  const msg = statusMessages[toStatus];
  if (msg) {
    const userIds = msg.notify === "both"
      ? [updated.buyerId, updated.sellerId]
      : msg.notify === "buyer"
        ? [updated.buyerId]
        : [updated.sellerId];
    await notificationService.createMany(userIds, {
      type: "trade-update",
      title: msg.title,
      link: `/trade/${tradeId}`,
    });
  }

  // Auto-refresh seller's listing liquidity after balance-changing events
  if (["ESCROW_LOCKED", "COMPLETED", "CANCELLED", "RESOLVED"].includes(toStatus)) {
    try {
      const { listingService } = await import("./listing.service");
      // Refresh all active listings for the seller
      const sellerListings = await prisma.listing.findMany({
        where: { sellerId: updated.sellerId, isActive: true },
      });
      for (const listing of sellerListings) {
        try {
          await listingService.refreshLiquidity(listing.id, updated.sellerId);
        } catch {
          // Non-critical — don't block trade flow
        }
      }
    } catch {
      // Non-critical
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

async function createTrade(
  buyerId: string,
  data: {
    listingId?: string;
    buyRequestId?: string;
    amount: number;
    paymentMethod: string;
    tradeType: string;
  }
) {
  if (!data.listingId && !data.buyRequestId) {
    throw new AppError(
      "Either listingId or buyRequestId is required",
      400,
      "MISSING_REFERENCE"
    );
  }

  let sellerId: string;
  let asset: string;
  let price: number;
  let chain: string = "solana";

  if (data.listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: data.listingId },
      include: { seller: { select: { walletAddress: true, ethWalletAddress: true } } },
    });
    if (!listing) throw new AppError("Listing not found", 404, "NOT_FOUND");
    if (!listing.isActive)
      throw new AppError("Listing is inactive", 400, "LISTING_INACTIVE");
    if (listing.sellerId === buyerId)
      throw new AppError("Cannot trade with yourself", 400, "SELF_TRADE");
    // If seller's balance dropped below their set min, allow 5% below balance as effective min
    const effectiveMin = (listing.availableLiquidity !== null && listing.availableLiquidity < listing.minAmount)
      ? listing.availableLiquidity * 0.95
      : listing.minAmount;
    const effectiveMax = (listing.availableLiquidity !== null && listing.availableLiquidity < listing.maxAmount)
      ? listing.availableLiquidity
      : listing.maxAmount;

    if (data.amount < effectiveMin - 0.000001 || data.amount > effectiveMax + 0.000001) {
      throw new AppError(
        `Amount must be between ${effectiveMin.toFixed(6)} and ${effectiveMax.toFixed(6)}`,
        400,
        "INVALID_AMOUNT"
      );
    }

    sellerId = listing.sellerId;
    asset = listing.asset;
    chain = listing.chain || (asset === "ETH" ? "ethereum" : "solana");

    // Calculate real price using market data for MARKET_PLUS/MINUS
    const { priceService } = await import("./price.service");
    price = await priceService.calculateListingPrice(
      listing.asset,
      listing.priceType,
      listing.priceValue
    );
  } else {
    const buyRequest = await prisma.buyRequest.findUnique({
      where: { id: data.buyRequestId! },
    });
    if (!buyRequest)
      throw new AppError("Buy request not found", 404, "NOT_FOUND");
    if (!buyRequest.isActive)
      throw new AppError("Buy request is inactive", 400, "REQUEST_INACTIVE");

    // When accepting a buy request, the current user is the seller
    sellerId = buyerId;
    buyerId = buyRequest.buyerId;
    asset = buyRequest.asset;
    chain = asset === "ETH" ? "ethereum" : "solana";
    price = data.amount; // seller sets the price when accepting
  }

  const protocolFee = data.amount * PROTOCOL_FEE_PERCENTAGE;

  const trade = await prisma.$transaction(async (tx) => {
    const newTrade = await tx.trade.create({
      data: {
        buyerId,
        sellerId,
        listingId: data.listingId || null,
        buyRequestId: data.buyRequestId || null,
        asset,
        amount: data.amount,
        price,
        paymentMethod: data.paymentMethod as any,
        tradeType: data.tradeType as any,
        chain,
        status: "CREATED",
        protocolFee,
      },
      include: {
        buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        listing: true,
      },
    });

    await tx.tradeStateLog.create({
      data: {
        tradeId: newTrade.id,
        fromStatus: null,
        toStatus: "CREATED",
        changedBy: sellerId === buyerId ? sellerId : buyerId,
      },
    });

    // Deactivate the buy request once a trade is created from it
    if (data.buyRequestId) {
      await tx.buyRequest.update({
        where: { id: data.buyRequestId },
        data: { isActive: false },
      });
    }

    return newTrade;
  });

  // Broadcast trade creation
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs.emit("trade-update", {
      tradeId: trade.id,
      status: "CREATED",
      trade,
    });
  }

  return trade;
}

// Deadline enforcement is handled by the cron job in index.ts
// which performs on-chain refund before DB cancellation.
// This function only returns deadline status for frontend display.
function checkDeadlineStatus(trade: any): { paymentExpired: boolean } {
  const now = new Date();
  const paymentExpired = !!(
    trade.status === "ESCROW_LOCKED" &&
    trade.paymentDeadline &&
    now > new Date(trade.paymentDeadline)
  );
  return { paymentExpired };
}

async function getTradeById(tradeId: string, userId: string) {
  let trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
      seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
      listing: true,
      stateLogs: { orderBy: { createdAt: "asc" } },
      dispute: true,
    },
  });

  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.buyerId !== userId && trade.sellerId !== userId) {
    throw new AppError("Not authorized to view this trade", 403, "FORBIDDEN");
  }

  // Check deadline status (cron handles actual cancellation + on-chain refund)
  const deadlineStatus = checkDeadlineStatus(trade);
  if (deadlineStatus.paymentExpired) {
    // Attach expired flag so frontend can show "pending cancellation" state
    (trade as any)._paymentExpired = true;
  }

  return trade;
}

async function getUserTrades(
  userId: string,
  filters?: { status?: string; page?: number; pageSize?: number }
) {
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const where: any = {
    OR: [{ buyerId: userId }, { sellerId: userId }],
  };
  if (filters?.status) {
    where.status = filters.status;
  }

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      include: {
        buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        listing: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trade.count({ where }),
  ]);

  return {
    trades,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

async function confirmEscrowLocked(
  tradeId: string,
  sellerId: string,
  escrowTxSignature: string
) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.sellerId !== sellerId)
    throw new AppError("Only the seller can lock escrow", 403, "FORBIDDEN");

  // For BTC trades, escrowTxSignature already contains the multisig script JSON
  // from createEscrow. Don't overwrite it — only update if not already set.
  const extra: Record<string, unknown> = {
    paymentDeadline: hoursFromNow(PAYMENT_DEADLINE_HOURS), // 24h starts NOW, not at trade creation
  };
  if (trade.chain === "bitcoin" && trade.escrowTxSignature) {
    // BTC: keep existing script data, don't overwrite
  } else {
    extra.escrowTxSignature = escrowTxSignature;
  }

  return transitionTrade(tradeId, "ESCROW_LOCKED", sellerId, undefined, extra);
}

async function markPaymentSent(tradeId: string, buyerId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.buyerId !== buyerId)
    throw new AppError("Only the buyer can mark payment sent", 403, "FORBIDDEN");

  // Check payment deadline
  if (trade.paymentDeadline && new Date() > trade.paymentDeadline) {
    throw new AppError("Payment deadline has passed", 400, "DEADLINE_PASSED");
  }

  // No confirmation deadline — seller releases manually, no auto-release ever
  return transitionTrade(tradeId, "PAYMENT_MARKED_SENT", buyerId);
}

async function confirmRelease(tradeId: string, sellerId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.sellerId !== sellerId)
    throw new AppError("Only the seller can release", 403, "FORBIDDEN");

  // First go to RELEASE_PENDING, then COMPLETED
  // In a real implementation, RELEASE_PENDING would trigger the on-chain release
  // and COMPLETED would be set after the tx confirms. For now, we go straight to COMPLETED.
  return transitionTrade(tradeId, "COMPLETED", sellerId);
}

async function cancelTrade(tradeId: string, userId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.buyerId !== userId && trade.sellerId !== userId)
    throw new AppError("Not authorized", 403, "FORBIDDEN");

  // Can only cancel before payment is marked sent
  if (
    trade.status === "PAYMENT_MARKED_SENT" ||
    trade.status === "RELEASE_PENDING" ||
    trade.status === "COMPLETED"
  ) {
    throw new AppError(
      "Cannot cancel trade at this stage",
      400,
      "CANCEL_NOT_ALLOWED"
    );
  }

  return transitionTrade(tradeId, "CANCELLED", userId, "Cancelled by user");
}

async function openDispute(
  tradeId: string,
  userId: string,
  reason: string
) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.buyerId !== userId && trade.sellerId !== userId)
    throw new AppError("Not authorized", 403, "FORBIDDEN");
  if (!["ESCROW_LOCKED", "PAYMENT_MARKED_SENT", "RELEASE_PENDING"].includes(trade.status))
    throw new AppError("Can only dispute trades with locked escrow", 400, "DISPUTE_NOT_ALLOWED");

  const updated = await prisma.$transaction(async (tx) => {
    await tx.dispute.create({
      data: {
        tradeId,
        initiatedBy: userId,
        reason,
      },
    });

    const updatedTrade = await tx.trade.update({
      where: { id: tradeId },
      data: { status: "DISPUTED" },
      include: {
        buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true, ethWalletAddress: true, btcAddress: true, btcPubkey: true } },
        dispute: true,
      },
    });

    await tx.tradeStateLog.create({
      data: {
        tradeId,
        fromStatus: trade.status,
        toStatus: "DISPUTED",
        changedBy: userId,
        reason,
      },
    });

    return updatedTrade;
  });

  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs.emit("trade-update", {
      tradeId,
      status: "DISPUTED",
      trade: updated,
    });
  }

  return updated;
}

async function getPendingActionCount(userId: string): Promise<number> {
  // Count trades where this user needs to take action:
  // - As seller: CREATED (need to lock escrow) or PAYMENT_MARKED_SENT (need to confirm release)
  // - As buyer: ESCROW_LOCKED (need to mark payment sent)
  const [sellerActions, buyerActions] = await Promise.all([
    prisma.trade.count({
      where: {
        sellerId: userId,
        status: { in: ["CREATED", "PAYMENT_MARKED_SENT"] },
      },
    }),
    prisma.trade.count({
      where: {
        buyerId: userId,
        status: "ESCROW_LOCKED",
      },
    }),
  ]);

  return sellerActions + buyerActions;
}

export const tradeService = {
  createTrade,
  getTradeById,
  getUserTrades,
  confirmEscrowLocked,
  markPaymentSent,
  confirmRelease,
  cancelTrade,
  openDispute,
  getPendingActionCount,
};

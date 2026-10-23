import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { io } from "../socket/index";
import { notificationService } from "./notification.service";
import type { DisputeResolution } from "@prisma/client";

async function getDispute(tradeId: string, userId: string) {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      dispute: {
        include: {
          evidence: {
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: "asc" },
          },
          initiator: { select: { id: true, username: true, profilePhoto: true } },
          resolver: { select: { id: true, username: true } },
        },
      },
      buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
      seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, username: true } } },
      },
    },
  });

  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (!trade.dispute) throw new AppError("No dispute on this trade", 404, "NO_DISPUTE");

  return { trade, dispute: trade.dispute };
}

async function uploadEvidence(
  disputeId: string,
  userId: string,
  data: { type: string; content: string }
) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { trade: true },
  });

  if (!dispute) throw new AppError("Dispute not found", 404, "NOT_FOUND");
  if (dispute.resolution) throw new AppError("Dispute already resolved", 400, "ALREADY_RESOLVED");

  // Only buyer or seller of the trade can upload evidence
  if (dispute.trade.buyerId !== userId && dispute.trade.sellerId !== userId) {
    throw new AppError("Not authorized", 403, "FORBIDDEN");
  }

  const evidence = await prisma.disputeEvidence.create({
    data: {
      disputeId,
      userId,
      type: data.type,
      content: data.content,
    },
    include: { user: { select: { id: true, username: true } } },
  });

  return evidence;
}

async function getOpenDisputes() {
  const disputes = await prisma.dispute.findMany({
    where: { resolution: null },
    include: {
      trade: {
        include: {
          buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
          seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
        },
      },
      initiator: { select: { id: true, username: true, profilePhoto: true } },
      evidence: { include: { user: { select: { id: true, username: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return disputes;
}

async function resolveDispute(
  disputeId: string,
  adminId: string,
  resolution: DisputeResolution,
  note?: string
) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { trade: true },
  });

  if (!dispute) throw new AppError("Dispute not found", 404, "NOT_FOUND");
  if (dispute.resolution) throw new AppError("Dispute already resolved", 400, "ALREADY_RESOLVED");

  const updated = await prisma.$transaction(async (tx) => {
    const resolved = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        resolution,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        resolveNote: note,
      },
    });

    await tx.trade.update({
      where: { id: dispute.tradeId },
      data: { status: "RESOLVED" },
    });

    await tx.tradeStateLog.create({
      data: {
        tradeId: dispute.tradeId,
        fromStatus: "DISPUTED",
        toStatus: "RESOLVED",
        changedBy: adminId,
        reason: `Dispute resolved: ${resolution}${note ? ` — ${note}` : ""}`,
      },
    });

    return resolved;
  });

  // Notify both parties
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs.emit("dispute-resolved", {
      tradeId: dispute.tradeId,
      resolution,
      buyerId: dispute.trade.buyerId,
      sellerId: dispute.trade.sellerId,
      note,
    });
  }

  // DB notifications — winner gets positive, loser gets negative
  const winnerId = resolution === "RELEASE_TO_BUYER" ? dispute.trade.buyerId : dispute.trade.sellerId;
  const loserId = resolution === "RELEASE_TO_BUYER" ? dispute.trade.sellerId : dispute.trade.buyerId;
  await notificationService.create({
    userId: winnerId,
    type: "dispute",
    title: "Dispute resolved in your favor!",
    subtitle: note || (resolution === "RELEASE_TO_BUYER" ? "Funds released to you" : "Funds refunded to you"),
    link: `/trade/${dispute.tradeId}`,
  });
  await notificationService.create({
    userId: loserId,
    type: "dispute",
    title: "Dispute resolved against you",
    subtitle: note || (resolution === "RELEASE_TO_BUYER" ? "Funds released to buyer" : "Funds refunded to seller"),
    link: `/trade/${dispute.tradeId}`,
  });

  // Refresh seller's listing liquidity after dispute resolution
  try {
    const { listingService } = await import("./listing.service");
    const sellerListings = await prisma.listing.findMany({
      where: { sellerId: dispute.trade.sellerId, isActive: true },
      select: { id: true, sellerId: true },
    });
    for (const listing of sellerListings) {
      try { await listingService.refreshLiquidity(listing.id, listing.sellerId); } catch {}
    }
  } catch {}

  return updated;
}

export const disputeService = {
  getDispute,
  uploadEvidence,
  getOpenDisputes,
  resolveDispute,
};

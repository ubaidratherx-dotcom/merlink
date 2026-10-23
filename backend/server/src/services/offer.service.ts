import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { io } from "../socket/index";
import { notificationService } from "./notification.service";
import {
  PROTOCOL_FEE_PERCENTAGE,
  PAYMENT_DEADLINE_HOURS,
} from "@merlink/types";

async function createOffer(
  sellerId: string,
  data: {
    buyRequestId: string;
    price: number;
    tradeType: string;
  }
) {
  const buyRequest = await prisma.buyRequest.findUnique({
    where: { id: data.buyRequestId },
    include: { buyer: { select: { id: true, username: true, profilePhoto: true } } },
  });

  if (!buyRequest) throw new AppError("Buy request not found", 404, "NOT_FOUND");
  if (!buyRequest.isActive) throw new AppError("Buy request is no longer active", 400, "REQUEST_INACTIVE");
  if (buyRequest.expiresAt < new Date()) throw new AppError("Buy request has expired", 400, "REQUEST_EXPIRED");
  if (buyRequest.buyerId === sellerId) throw new AppError("Cannot offer on your own buy request", 400, "SELF_OFFER");

  // Check seller is verified
  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) throw new AppError("Seller not found", 404, "NOT_FOUND");
  if (seller.kycStatus !== "VERIFIED") throw new AppError("KYC verification required", 403, "KYC_REQUIRED");
  if (!seller.sellerMode) throw new AppError("Seller mode required", 403, "SELLER_MODE_REQUIRED");

  // Check for existing pending offer from this seller on this request
  const existing = await prisma.offer.findFirst({
    where: { buyRequestId: data.buyRequestId, sellerId, status: "PENDING" },
  });
  if (existing) throw new AppError("You already have a pending offer on this request", 400, "DUPLICATE_OFFER");

  const offer = await prisma.offer.create({
    data: {
      buyRequestId: data.buyRequestId,
      sellerId,
      price: data.price,
      tradeType: data.tradeType as any,
    },
    include: {
      seller: { select: { id: true, username: true, profilePhoto: true } },
    },
  });

  // Notify buyer via Socket.io
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs?.emit("new-offer", {
      offer: {
        ...offer,
        buyRequest: {
          id: buyRequest.id,
          asset: buyRequest.asset,
          amount: buyRequest.amount,
          paymentMethod: buyRequest.paymentMethod,
          buyerId: buyRequest.buyerId,
        },
      },
    });
  }

  // DB notification for buyer
  await notificationService.create({
    userId: buyRequest.buyerId,
    type: "offer",
    title: `New offer from ${offer.seller?.username || "a seller"}`,
    subtitle: `$${data.price}/${buyRequest.asset} for ${buyRequest.amount} ${buyRequest.asset}`,
    link: `/buy-request/${buyRequest.id}`,
  });

  return offer;
}

async function getOffersForBuyRequest(buyRequestId: string, userId: string) {
  const buyRequest = await prisma.buyRequest.findUnique({
    where: { id: buyRequestId },
  });
  if (!buyRequest) throw new AppError("Buy request not found", 404, "NOT_FOUND");

  // Only the buyer or a seller with a pending offer can view
  const offers = await prisma.offer.findMany({
    where: { buyRequestId, status: "PENDING" },
    include: {
      seller: { select: { id: true, username: true, profilePhoto: true, latitude: true, longitude: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Enrich with seller stats
  const enriched = await Promise.all(
    offers.map(async (offer) => {
      const [totalTrades, ratingAgg] = await Promise.all([
        prisma.trade.count({
          where: { OR: [{ buyerId: offer.sellerId }, { sellerId: offer.sellerId }] },
        }),
        prisma.review.aggregate({
          where: { revieweeId: offer.sellerId },
          _avg: { rating: true },
        }),
      ]);

      return {
        ...offer,
        seller: {
          ...offer.seller,
          rating: Math.round((ratingAgg._avg.rating ?? 0) * 100) / 100,
          totalTrades,
        },
      };
    })
  );

  return enriched;
}

async function acceptOffer(offerId: string, buyerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      buyRequest: true,
    },
  });

  if (!offer) throw new AppError("Offer not found", 404, "NOT_FOUND");
  if (offer.status !== "PENDING") throw new AppError("Offer is no longer pending", 400, "OFFER_NOT_PENDING");
  if (offer.buyRequest.buyerId !== buyerId) throw new AppError("Only the buyer can accept offers", 403, "FORBIDDEN");
  if (!offer.buyRequest.isActive) throw new AppError("Buy request is no longer active", 400, "REQUEST_INACTIVE");

  const protocolFee = offer.buyRequest.amount * PROTOCOL_FEE_PERCENTAGE;
  const paymentDeadline = new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);

  // Everything in one transaction: create trade + accept offer + decline others + deactivate request
  const newTrade = await prisma.$transaction(async (tx) => {
    // Create the trade
    const trade = await tx.trade.create({
      data: {
        buyerId: offer.buyRequest.buyerId,
        sellerId: offer.sellerId,
        buyRequestId: offer.buyRequestId,
        asset: offer.buyRequest.asset,
        amount: offer.buyRequest.amount,
        price: offer.price,
        paymentMethod: offer.buyRequest.paymentMethod,
        tradeType: offer.tradeType,
        chain: offer.buyRequest.asset === "ETH" ? "ethereum" : "solana",
        status: "CREATED",
        protocolFee,
        paymentDeadline,
      },
      include: {
        buyer: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
        seller: { select: { id: true, username: true, profilePhoto: true, walletAddress: true } },
        listing: true,
      },
    });

    // Trade state log
    await tx.tradeStateLog.create({
      data: {
        tradeId: trade.id,
        fromStatus: null,
        toStatus: "CREATED",
        changedBy: buyerId,
      },
    });

    // Accept this offer
    await tx.offer.update({
      where: { id: offerId },
      data: { status: "ACCEPTED" },
    });

    // Decline all other pending offers
    await tx.offer.updateMany({
      where: {
        buyRequestId: offer.buyRequestId,
        id: { not: offerId },
        status: "PENDING",
      },
      data: { status: "DECLINED" },
    });

    // Deactivate the buy request
    await tx.buyRequest.update({
      where: { id: offer.buyRequestId },
      data: { isActive: false },
    });

    return trade;
  });

  // Notify seller their offer was accepted
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs?.emit("offer-accepted", {
      offerId,
      sellerId: offer.sellerId,
      buyerUsername: newTrade.buyer?.username,
      asset: offer.buyRequest.asset,
      amount: offer.buyRequest.amount,
      tradeId: newTrade.id,
    });
  }

  await notificationService.create({
    userId: offer.sellerId,
    type: "trade-update",
    title: `${newTrade.buyer?.username || "Buyer"} accepted your offer for ${offer.buyRequest.amount} ${offer.buyRequest.asset}!`,
    subtitle: `Trade created — ${offer.buyRequest.amount} ${offer.buyRequest.asset}`,
    link: `/trade/${newTrade.id}`,
  });

  return newTrade;
}

async function declineOffer(offerId: string, buyerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { buyRequest: true },
  });

  if (!offer) throw new AppError("Offer not found", 404, "NOT_FOUND");
  if (offer.status !== "PENDING") throw new AppError("Offer is no longer pending", 400, "OFFER_NOT_PENDING");
  if (offer.buyRequest.buyerId !== buyerId) throw new AppError("Only the buyer can decline offers", 403, "FORBIDDEN");

  const updated = await prisma.offer.update({
    where: { id: offerId },
    data: { status: "DECLINED" },
    include: {
      buyRequest: { include: { buyer: { select: { id: true, username: true } } } },
    },
  });

  // Notify seller their offer was declined
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs?.emit("offer-declined", {
      offerId: offer.id,
      sellerId: offer.sellerId,
      buyerUsername: updated.buyRequest.buyer.username,
      asset: updated.buyRequest.asset,
      amount: updated.buyRequest.amount,
      buyRequestId: offer.buyRequestId,
    });
  }

  await notificationService.create({
    userId: offer.sellerId,
    type: "trade-update",
    title: `${updated.buyRequest.buyer.username || "Buyer"} declined your offer for ${updated.buyRequest.amount} ${updated.buyRequest.asset}`,
    subtitle: `${updated.buyRequest.amount} ${updated.buyRequest.asset}`,
  });

  return updated;
}

export const offerService = {
  createOffer,
  getOffersForBuyRequest,
  acceptOffer,
  declineOffer,
};

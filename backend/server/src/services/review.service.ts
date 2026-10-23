import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

async function createReview(
  tradeId: string,
  reviewerId: string,
  rating: number,
  comment?: string
) {
  if (rating < 1 || rating > 5) {
    throw new AppError("Rating must be between 1 and 5", 400, "INVALID_RATING");
  }

  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.status !== "COMPLETED") {
    throw new AppError("Can only review completed trades", 400, "NOT_COMPLETED");
  }
  if (trade.buyerId !== reviewerId && trade.sellerId !== reviewerId) {
    throw new AppError("Not a participant in this trade", 403, "FORBIDDEN");
  }

  // Reviewer reviews the other party
  const revieweeId = trade.buyerId === reviewerId ? trade.sellerId : trade.buyerId;

  // Check if already reviewed
  const existing = await prisma.review.findUnique({
    where: { tradeId_reviewerId: { tradeId, reviewerId } },
  });
  if (existing) {
    throw new AppError("You have already reviewed this trade", 400, "ALREADY_REVIEWED");
  }

  const review = await prisma.review.create({
    data: {
      tradeId,
      reviewerId,
      revieweeId,
      rating,
      comment: comment?.trim() || null,
    },
    include: {
      reviewer: { select: { id: true, username: true, profilePhoto: true } },
    },
  });

  return review;
}

async function getTradeReviews(tradeId: string) {
  return prisma.review.findMany({
    where: { tradeId },
    include: {
      reviewer: { select: { id: true, username: true, profilePhoto: true } },
      reviewee: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function hasReviewed(tradeId: string, reviewerId: string): Promise<boolean> {
  const count = await prisma.review.count({
    where: { tradeId, reviewerId },
  });
  return count > 0;
}

export const reviewService = {
  createReview,
  getTradeReviews,
  hasReviewed,
};

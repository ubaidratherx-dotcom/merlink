import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeUser(user: Record<string, unknown>) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Get user by ID
// ---------------------------------------------------------------------------

async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }
  return sanitizeUser(user);
}

// ---------------------------------------------------------------------------
// Get user by username
// ---------------------------------------------------------------------------

async function getUserByUsername(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }
  return sanitizeUser(user);
}

// ---------------------------------------------------------------------------
// Update profile
// ---------------------------------------------------------------------------

async function updateProfile(
  userId: string,
  data: {
    username?: string;
    profilePhoto?: string;
    latitude?: number;
    longitude?: number;
    bio?: string;
  }
) {
  // If updating username, check uniqueness
  if (data.username) {
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing && existing.id !== userId) {
      throw new AppError("Username already taken", 409, "CONFLICT");
    }
  }

  // Validate bio length
  if (data.bio !== undefined && data.bio.length > 250) {
    throw new AppError("Bio must be 250 characters or less", 400, "VALIDATION");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.username && { username: data.username }),
      ...(data.profilePhoto !== undefined && { profilePhoto: data.profilePhoto }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      ...(data.bio !== undefined && { bio: data.bio }),
    },
  });

  // Sync location to all active listings and buy requests
  if (data.latitude !== undefined && data.longitude !== undefined) {
    await Promise.all([
      prisma.listing.updateMany({
        where: { sellerId: userId },
        data: { latitude: data.latitude, longitude: data.longitude },
      }),
      prisma.buyRequest.updateMany({
        where: { buyerId: userId, isActive: true },
        data: { latitude: data.latitude, longitude: data.longitude },
      }),
    ]);
  }

  return sanitizeUser(user);
}

// ---------------------------------------------------------------------------
// Get public profile
// ---------------------------------------------------------------------------

async function getPublicProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  // Gather trade stats
  const [totalTradesAsBuyer, totalTradesAsSeller] = await Promise.all([
    prisma.trade.count({ where: { buyerId: userId } }),
    prisma.trade.count({ where: { sellerId: userId } }),
  ]);
  const totalTrades = totalTradesAsBuyer + totalTradesAsSeller;

  // Average rating from reviews received
  const ratingAgg = await prisma.review.aggregate({
    where: { revieweeId: userId },
    _avg: { rating: true },
  });
  const averageRating = ratingAgg._avg.rating ?? 0;

  // Dispute ratio
  const disputeCount = await prisma.dispute.count({
    where: { initiatedBy: userId },
  });
  const disputeRatio = totalTrades > 0 ? disputeCount / totalTrades : 0;

  // Account age in days
  const accountAge = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Active listings
  const listings = await prisma.listing.findMany({
    where: { sellerId: userId, isActive: true },
    select: {
      id: true, asset: true, chain: true, priceType: true, priceValue: true,
      minAmount: true, maxAmount: true, paymentMethods: true, tradeType: true,
      availableLiquidity: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Recent reviews
  const reviews = await prisma.review.findMany({
    where: { revieweeId: userId },
    select: {
      id: true, rating: true, comment: true, createdAt: true,
      reviewer: { select: { id: true, username: true, profilePhoto: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    id: user.id,
    username: user.username,
    profilePhoto: user.profilePhoto,
    bio: user.bio,
    kycStatus: user.kycStatus,
    sellerMode: user.sellerMode,
    createdAt: user.createdAt,
    totalTrades,
    averageRating: Math.round(averageRating * 100) / 100,
    accountAge,
    disputeRatio: Math.round(disputeRatio * 1000) / 1000,
    listings,
    reviews,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const userService = {
  getUserById,
  getUserByUsername,
  updateProfile,
  getPublicProfile,
};

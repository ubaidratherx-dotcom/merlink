import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { walletService } from "./wallet.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateListingData {
  asset: "USDC" | "SOL";
  priceType: "FIXED" | "MARKET_PLUS" | "MARKET_MINUS";
  priceValue: number;
  minAmount: number;
  maxAmount: number;
  paymentMethods: (
    | "BANK_TRANSFER"
    | "CASH"
    | "WISE"
    | "REVOLUT"
    | "MOBILE_MONEY"
    | "PAYPAL"
    | "OTHER"
  )[];
  tradeType: "IN_PERSON" | "REMOTE" | "BOTH";
}

interface UpdateListingData {
  priceType?: "FIXED" | "MARKET_PLUS" | "MARKET_MINUS";
  priceValue?: number;
  minAmount?: number;
  maxAmount?: number;
  paymentMethods?: (
    | "BANK_TRANSFER"
    | "CASH"
    | "WISE"
    | "REVOLUT"
    | "MOBILE_MONEY"
    | "PAYPAL"
    | "OTHER"
  )[];
  tradeType?: "IN_PERSON" | "REMOTE" | "BOTH";
  isActive?: boolean;
}

interface GetListingsFilters {
  asset?: "USDC" | "SOL";
  paymentMethod?: string;
  tradeType?: "IN_PERSON" | "REMOTE" | "BOTH";
  minAmount?: number;
  maxAmount?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getAssetBalance(
  walletAddress: string,
  asset: "USDC" | "SOL"
): Promise<number> {
  const balance = await walletService.getWalletBalance(walletAddress);
  return asset === "SOL" ? balance.sol : balance.usdc;
}

// ---------------------------------------------------------------------------
// enableSellerMode
// ---------------------------------------------------------------------------

async function enableSellerMode(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (!user.walletAddress || !user.walletVerified) {
    throw new AppError(
      "A verified wallet is required to enable seller mode",
      400,
      "WALLET_REQUIRED"
    );
  }

  if (user.kycStatus !== "VERIFIED") {
    throw new AppError(
      "KYC verification is required to enable seller mode",
      403,
      "KYC_REQUIRED"
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { sellerMode: true },
  });

  const { passwordHash, ...sanitized } = updatedUser;
  return sanitized;
}

// ---------------------------------------------------------------------------
// createListing
// ---------------------------------------------------------------------------

async function createListing(userId: string, data: CreateListingData) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  if (!user.sellerMode) {
    throw new AppError(
      "Seller mode must be enabled to create listings",
      403,
      "SELLER_MODE_REQUIRED"
    );
  }

  if (!user.walletAddress || !user.walletVerified) {
    throw new AppError(
      "A verified wallet is required to create listings",
      400,
      "WALLET_REQUIRED"
    );
  }

  // Fetch wallet balance for the listed asset
  const liquidity = await getAssetBalance(user.walletAddress, data.asset);

  // Auto-deactivate if insufficient liquidity
  const isActive = liquidity >= data.minAmount;

  const listing = await prisma.listing.create({
    data: {
      sellerId: userId,
      asset: data.asset,
      priceType: data.priceType,
      priceValue: data.priceValue,
      minAmount: data.minAmount,
      maxAmount: data.maxAmount,
      paymentMethods: data.paymentMethods,
      tradeType: data.tradeType,
      availableLiquidity: liquidity,
      isActive,
      latitude: user.latitude,
      longitude: user.longitude,
    },
  });

  return listing;
}

// ---------------------------------------------------------------------------
// updateListing
// ---------------------------------------------------------------------------

async function updateListing(
  userId: string,
  listingId: string,
  data: UpdateListingData
) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    throw new AppError("Listing not found", 404, "NOT_FOUND");
  }

  if (listing.sellerId !== userId) {
    throw new AppError(
      "You can only update your own listings",
      403,
      "FORBIDDEN"
    );
  }

  // If minAmount is changing, re-check liquidity
  let isActive = data.isActive;
  if (data.minAmount !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.walletAddress) {
      const liquidity = await getAssetBalance(
        user.walletAddress,
        listing.asset
      );
      if (liquidity < data.minAmount) {
        isActive = false;
      }
    }
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(data.priceType !== undefined && { priceType: data.priceType }),
      ...(data.priceValue !== undefined && { priceValue: data.priceValue }),
      ...(data.minAmount !== undefined && { minAmount: data.minAmount }),
      ...(data.maxAmount !== undefined && { maxAmount: data.maxAmount }),
      ...(data.paymentMethods !== undefined && {
        paymentMethods: data.paymentMethods,
      }),
      ...(data.tradeType !== undefined && { tradeType: data.tradeType }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// deleteListing
// ---------------------------------------------------------------------------

async function deleteListing(userId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    throw new AppError("Listing not found", 404, "NOT_FOUND");
  }

  if (listing.sellerId !== userId) {
    throw new AppError(
      "You can only delete your own listings",
      403,
      "FORBIDDEN"
    );
  }

  await prisma.listing.delete({ where: { id: listingId } });
}

// ---------------------------------------------------------------------------
// getListingById
// ---------------------------------------------------------------------------

async function getListingById(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: {
        select: {
          id: true,
          username: true,
          profilePhoto: true,
        },
      },
    },
  });

  if (!listing) {
    throw new AppError("Listing not found", 404, "NOT_FOUND");
  }

  // Gather seller stats
  const [totalTrades, ratingAgg] = await Promise.all([
    prisma.trade.count({
      where: {
        OR: [
          { buyerId: listing.sellerId },
          { sellerId: listing.sellerId },
        ],
      },
    }),
    prisma.review.aggregate({
      where: { revieweeId: listing.sellerId },
      _avg: { rating: true },
    }),
  ]);

  const averageRating = ratingAgg._avg.rating ?? 0;

  return {
    ...listing,
    seller: {
      ...listing.seller,
      rating: Math.round(averageRating * 100) / 100,
      totalTrades,
    },
  };
}

// ---------------------------------------------------------------------------
// getListings (public discovery)
// ---------------------------------------------------------------------------

async function getListings(filters: GetListingsFilters) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = { isActive: true };

  if (filters.asset) {
    where.asset = filters.asset;
  }

  if (filters.paymentMethod) {
    where.paymentMethods = { has: filters.paymentMethod };
  }

  if (filters.tradeType) {
    where.tradeType = filters.tradeType;
  }

  if (filters.minAmount !== undefined) {
    where.maxAmount = { gte: filters.minAmount };
  }

  if (filters.maxAmount !== undefined) {
    where.minAmount = { lte: filters.maxAmount };
  }

  // Fetch listings with seller info
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            profilePhoto: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.count({ where }),
  ]);

  // Gather seller stats for all sellers in one go
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];

  const [tradeCounts, ratings] = await Promise.all([
    Promise.all(
      sellerIds.map(async (sid) => ({
        sellerId: sid,
        count: await prisma.trade.count({
          where: {
            OR: [{ buyerId: sid }, { sellerId: sid }],
          },
        }),
      }))
    ),
    Promise.all(
      sellerIds.map(async (sid) => ({
        sellerId: sid,
        rating:
          (
            await prisma.review.aggregate({
              where: { revieweeId: sid },
              _avg: { rating: true },
            })
          )._avg.rating ?? 0,
      }))
    ),
  ]);

  const tradeCountMap = new Map(
    tradeCounts.map((t) => [t.sellerId, t.count])
  );
  const ratingMap = new Map(ratings.map((r) => [r.sellerId, r.rating]));

  // Calculate ranking scores and enrich
  const hasLocation =
    filters.latitude !== undefined && filters.longitude !== undefined;

  const enriched = listings.map((listing) => {
    const sellerTrades = tradeCountMap.get(listing.sellerId) ?? 0;
    const sellerRating = ratingMap.get(listing.sellerId) ?? 0;

    // Distance score (0-1, lower distance = higher score)
    let distanceScore = 0.5; // default if no location
    let distance: number | null = null;
    if (
      hasLocation &&
      listing.latitude !== null &&
      listing.longitude !== null
    ) {
      distance = haversineDistance(
        filters.latitude!,
        filters.longitude!,
        listing.latitude,
        listing.longitude
      );
      const radius = filters.radius ?? 100;
      distanceScore = Math.max(0, 1 - distance / radius);

      // Filter out listings beyond radius
      if (distance > radius) {
        return null;
      }
    }

    // Reputation score (0-1)
    const reputationScore = sellerRating / 5;

    // Trade count score (0-1, normalized with diminishing returns)
    const tradeCountScore = Math.min(1, sellerTrades / 100);

    // Price competitiveness score (simplified: 0.5 for all, since we'd
    // need market price to compare properly)
    const priceScore = 0.5;

    // Weighted ranking
    const rankingScore =
      distanceScore * 0.4 +
      reputationScore * 0.3 +
      tradeCountScore * 0.2 +
      priceScore * 0.1;

    return {
      ...listing,
      seller: {
        id: listing.seller.id,
        username: listing.seller.username,
        profilePhoto: listing.seller.profilePhoto,
        rating: Math.round(sellerRating * 100) / 100,
        totalTrades: sellerTrades,
      },
      distance: distance !== null ? Math.round(distance * 10) / 10 : null,
      rankingScore,
    };
  });

  // Filter nulls (out of radius) and sort by ranking score
  const ranked = enriched
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.rankingScore - a.rankingScore);

  return {
    items: ranked,
    total: hasLocation ? ranked.length : total,
    page,
    pageSize: limit,
    hasMore: hasLocation
      ? false // already filtered in-memory
      : skip + limit < total,
  };
}

// ---------------------------------------------------------------------------
// getMyListings
// ---------------------------------------------------------------------------

async function getMyListings(userId: string) {
  const listings = await prisma.listing.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return listings;
}

// ---------------------------------------------------------------------------
// refreshLiquidity
// ---------------------------------------------------------------------------

async function refreshLiquidity(listingId: string, userId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    throw new AppError("Listing not found", 404, "NOT_FOUND");
  }

  if (listing.sellerId !== userId) {
    throw new AppError(
      "You can only refresh your own listings",
      403,
      "FORBIDDEN"
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: listing.sellerId },
  });

  if (!user?.walletAddress) {
    throw new AppError("No wallet connected", 400, "WALLET_REQUIRED");
  }

  const liquidity = await getAssetBalance(user.walletAddress, listing.asset);

  // Determine active status based on liquidity
  const isActive = liquidity >= listing.minAmount;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      availableLiquidity: liquidity,
      isActive,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const listingService = {
  enableSellerMode,
  createListing,
  updateListing,
  deleteListing,
  getListingById,
  getListings,
  getMyListings,
  refreshLiquidity,
};

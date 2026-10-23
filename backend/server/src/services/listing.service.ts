import { prisma } from "../lib/prisma";
import { ensureDemoTradersNear } from "./demoTraders.service";
import { AppError } from "../middleware/errorHandler";
import { walletService } from "./wallet.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateListingData {
  asset: string;
  chain: "solana" | "ethereum";
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
  paymentInstructions?: string;
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
  paymentInstructions?: string;
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
  excludeSellerId?: string;
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
  asset: string,
  chain: string,
  ethWalletAddress?: string | null,
  btcAddress?: string | null
): Promise<number> {
  if (chain === "bitcoin") {
    if (!btcAddress) return 0;
    const { btcEscrowService } = await import("./btc-escrow.service");
    return btcEscrowService.getBalance(btcAddress);
  }
  if (chain === "ethereum") {
    if (!ethWalletAddress) return 0;
    const ethBalance = await walletService.getEthBalance(ethWalletAddress);
    if (asset === "ETH") return ethBalance.eth;
    if (asset === "USDC") return ethBalance.usdc;
    if (asset === "USDT") return ethBalance.usdt;
    return 0;
  }
  // Solana chain
  if (!walletAddress) return 0;
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

  const isBtcChain = data.chain === "bitcoin";
  const isEthChain = data.chain === "ethereum";
  const hasSolWallet = user.walletAddress && user.walletVerified;
  const hasEthWallet = user.ethWalletAddress && user.ethWalletVerified;
  const hasBtcWallet = !!user.btcAddress;

  if (isBtcChain && !hasBtcWallet) {
    throw new AppError("A Bitcoin wallet is required for BTC listings", 400, "WALLET_REQUIRED");
  }
  if (isEthChain && !hasEthWallet) {
    throw new AppError("A verified Ethereum wallet is required for Ethereum listings", 400, "WALLET_REQUIRED");
  }
  if (!isEthChain && !isBtcChain && !hasSolWallet) {
    throw new AppError("A verified Solana wallet is required for Solana listings", 400, "WALLET_REQUIRED");
  }

  // Fetch wallet balance for the listed asset
  const liquidity = await getAssetBalance(
    user.walletAddress || "",
    data.asset,
    data.chain,
    user.ethWalletAddress,
    user.btcAddress
  );

  // Auto-deactivate if insufficient liquidity
  const isActive = liquidity >= data.minAmount;

  const listing = await prisma.listing.create({
    data: {
      sellerId: userId,
      asset: data.asset,
      chain: data.chain,
      priceType: data.priceType,
      priceValue: data.priceValue,
      minAmount: data.minAmount,
      maxAmount: data.maxAmount,
      paymentMethods: data.paymentMethods,
      tradeType: data.tradeType,
      paymentInstructions: data.paymentInstructions || null,
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
    if (user?.walletAddress || user?.ethWalletAddress || user?.btcAddress) {
      const liquidity = await getAssetBalance(
        user.walletAddress || "",
        listing.asset,
        listing.chain || "solana",
        user.ethWalletAddress,
        user.btcAddress
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
      ...(data.paymentInstructions !== undefined && { paymentInstructions: data.paymentInstructions }),
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

// Tiered search radii in km
// Auto-search tiers: 10 → 50 → 100 (stop here, show expand prompt)
// Manual expand tiers: City (500km) → Country (2000km) → Global (0)
const AUTO_TIERS = [10, 50, 100] as const;
const TIER_LABELS: Record<number, string> = {
  10: "10 km",
  50: "50 km",
  100: "100 km",
  500: "City",
  2000: "Country",
  0: "Global",
};

const NEXT_TIER: Record<number, number | null> = {
  10: 50,
  50: 100,
  100: 500,    // → "Expand to City"
  500: 2000,   // → "Expand to Country"
  2000: 0,     // → "Expand to Global"
  0: null,
};

async function getListings(filters: GetListingsFilters) {
  // Demo mode: make sure the searched location has sample traders around it
  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    await ensureDemoTradersNear(filters.latitude, filters.longitude);
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = { isActive: true };

  if (filters.excludeSellerId) {
    where.sellerId = { not: filters.excludeSellerId };
  }

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

  // Location search: page over nearby listings, not the newest ones worldwide.
  // A bounding box narrows the query; the exact haversine filter runs below.
  const hasLocationFilter = filters.latitude !== undefined && filters.longitude !== undefined;
  const radiusKm = filters.radius ?? 0;
  if (hasLocationFilter && radiusKm > 0) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((filters.latitude! * Math.PI) / 180)));
    where.latitude = { gte: filters.latitude! - dLat, lte: filters.latitude! + dLat };
    where.longitude = { gte: filters.longitude! - dLng, lte: filters.longitude! + dLng };
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
      // With a location the whole nearby set is ranked in memory (no paging), so take a wide candidate set
      skip: hasLocationFilter ? 0 : skip,
      take: hasLocationFilter ? Math.max(limit, 100) : limit,
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

  const hasLocation =
    filters.latitude !== undefined && filters.longitude !== undefined;

  // Enrich all listings with distance + ranking
  const enriched = listings
    .map((listing) => {
      const sellerTrades = tradeCountMap.get(listing.sellerId) ?? 0;
      const sellerRating = ratingMap.get(listing.sellerId) ?? 0;

      let distance: number | null = null;
      if (hasLocation) {
        if (listing.latitude === null || listing.longitude === null) {
          return null;
        }
        distance = haversineDistance(
          filters.latitude!,
          filters.longitude!,
          listing.latitude,
          listing.longitude
        );
      }

      const radius = filters.radius ?? 0; // 0 = global
      let distanceScore = 0.5;
      if (hasLocation && distance !== null && radius > 0) {
        if (distance > radius) return null;
        distanceScore = Math.max(0, 1 - distance / radius);
      } else if (hasLocation && distance !== null) {
        // Global: gentle decay over 1000km
        distanceScore = Math.max(0, 1 - distance / 1000);
      }

      const reputationScore = sellerRating / 5;
      const tradeCountScore = Math.min(1, sellerTrades / 100);
      const priceScore = 0.5;

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
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.rankingScore - a.rankingScore);

  // If explicit radius was provided, return results at that radius
  if (filters.radius !== undefined) {
    // Find next tier that actually has results (skip empty tiers)
    let smartNextRadius: number | null = null;
    if (hasLocation) {
      let candidate = NEXT_TIER[filters.radius] ?? null;
      while (candidate !== null) {
        const inCandidate =
          candidate === 0
            ? enriched
            : enriched.filter((item) => item.distance !== null && item.distance <= candidate!);
        if (inCandidate.length > enriched.length || (candidate === 0 && enriched.length === 0)) {
          // This tier would give more results
          smartNextRadius = candidate;
          break;
        }
        candidate = NEXT_TIER[candidate] ?? null;
      }
    }

    return {
      items: enriched,
      total: hasLocation ? enriched.length : total,
      page,
      pageSize: limit,
      hasMore: hasLocation ? false : skip + limit < total,
      radius: filters.radius,
      radiusLabel: TIER_LABELS[filters.radius] || `${filters.radius} km`,
      nextRadius: smartNextRadius,
    };
  }

  // Auto-tier: only auto-expand through 10 → 50 → 100km
  // Beyond 100km, user must manually expand (City → Country → Global)
  if (hasLocation) {
    for (const tier of AUTO_TIERS) {
      const inTier = enriched.filter(
        (item) => item.distance !== null && item.distance <= tier
      );

      if (inTier.length > 0) {
        // Find next tier that would give MORE results
        let smartNext: number | null = null;
        let candidate = NEXT_TIER[tier] ?? null;
        while (candidate !== null) {
          const inCandidate =
            candidate === 0
              ? enriched
              : enriched.filter((item) => item.distance !== null && item.distance <= candidate!);
          if (inCandidate.length > inTier.length) {
            smartNext = candidate;
            break;
          }
          candidate = NEXT_TIER[candidate] ?? null;
        }

        return {
          items: inTier,
          total: inTier.length,
          page,
          pageSize: limit,
          hasMore: false,
          radius: tier,
          radiusLabel: TIER_LABELS[tier],
          nextRadius: smartNext,
        };
      }
    }

    // Nothing within 100km — find the first manual tier that actually has results
    const MANUAL_TIERS = [500, 2000, 0] as const;
    for (const tier of MANUAL_TIERS) {
      const inTier =
        tier === 0
          ? enriched
          : enriched.filter((item) => item.distance !== null && item.distance <= tier);

      if (inTier.length > 0) {
        return {
          items: [],
          total: 0,
          page,
          pageSize: limit,
          hasMore: false,
          radius: 100,
          radiusLabel: "100 km",
          nextRadius: tier,
        };
      }
    }

    // Absolutely nothing anywhere
    return {
      items: [],
      total: 0,
      page,
      pageSize: limit,
      hasMore: false,
      radius: 0,
      radiusLabel: "Global",
      nextRadius: null,
    };
  }

  // No location — return all
  return {
    items: enriched,
    total,
    page,
    pageSize: limit,
    hasMore: skip + limit < total,
    radius: null,
    radiusLabel: null,
    nextRadius: null,
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

  const isBtcChainR = listing.chain === "bitcoin";
  const isEthChainR = listing.chain === "ethereum";
  if (isBtcChainR && !user?.btcAddress) {
    throw new AppError("No BTC wallet connected", 400, "WALLET_REQUIRED");
  }
  if (isEthChainR && !user?.ethWalletAddress) {
    throw new AppError("No ETH wallet connected", 400, "WALLET_REQUIRED");
  }
  if (!isEthChainR && !isBtcChainR && !user?.walletAddress) {
    throw new AppError("No wallet connected", 400, "WALLET_REQUIRED");
  }

  const liquidity = await getAssetBalance(
    user!.walletAddress || "",
    listing.asset,
    listing.chain || "solana",
    user!.ethWalletAddress,
    user!.btcAddress
  );

  // Update liquidity but don't auto-deactivate — trade creation validates liquidity separately
  // Listing stays active so seller doesn't have to manually re-enable after escrow release
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      availableLiquidity: liquidity,
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

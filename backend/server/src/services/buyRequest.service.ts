import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { io } from "../socket/index";
import { notificationService } from "./notification.service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUY_REQUEST_EXPIRY_MINUTES = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateBuyRequestData {
  asset: "USDC" | "SOL";
  amount: number;
  paymentMethod:
    | "BANK_TRANSFER"
    | "CASH"
    | "WISE"
    | "REVOLUT"
    | "MOBILE_MONEY"
    | "PAYPAL"
    | "OTHER";
  latitude: number;
  longitude: number;
}

interface GetBuyRequestsFilters {
  asset?: "USDC" | "SOL";
  paymentMethod?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  page?: number;
  limit?: number;
  excludeBuyerId?: string;
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

/** Mark expired buy requests as inactive (lazy expiry). */
async function expireStale(): Promise<void> {
  await prisma.buyRequest.updateMany({
    where: {
      isActive: true,
      expiresAt: { lt: new Date() },
    },
    data: { isActive: false },
  });
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

async function createBuyRequest(userId: string, data: CreateBuyRequestData) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

  if (user.kycStatus !== "VERIFIED") {
    throw new AppError(
      "KYC verification is required to create buy requests",
      403,
      "KYC_REQUIRED"
    );
  }

  // Expire stale requests first
  await expireStale();

  // Limit active buy requests per user to prevent spam
  const activeCount = await prisma.buyRequest.count({
    where: { buyerId: userId, isActive: true, expiresAt: { gt: new Date() } },
  });

  if (activeCount >= 3) {
    throw new AppError(
      "You can have at most 3 active buy requests",
      400,
      "LIMIT_REACHED"
    );
  }

  const expiresAt = new Date(
    Date.now() + BUY_REQUEST_EXPIRY_MINUTES * 60 * 1000
  );

  const buyRequest = await prisma.buyRequest.create({
    data: {
      buyerId: userId,
      asset: data.asset,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      latitude: data.latitude,
      longitude: data.longitude,
      expiresAt,
    },
    include: {
      buyer: {
        select: { id: true, username: true, profilePhoto: true },
      },
    },
  });

  // Notify sellers via Socket.io
  const tradeNs = io?.of("/trade");
  if (tradeNs) {
    tradeNs.emit("new-buy-request", {
      buyRequest: { ...buyRequest, distance: null },
    });
  }

  // Store DB notifications for nearby sellers
  const sellers = await prisma.user.findMany({
    where: { sellerMode: true, id: { not: userId }, latitude: { not: null } },
    select: { id: true },
  });
  if (sellers.length > 0) {
    await notificationService.createMany(
      sellers.map((s) => s.id),
      {
        type: "buy-request",
        title: `${buyRequest.buyer?.username || "A buyer"} wants to buy ${data.amount} ${data.asset} nearby`,
        subtitle: `${data.amount} ${data.asset} via ${data.paymentMethod.replace("_", " ").toLowerCase()}`,
        link: `/?tab=buyers&highlight=${buyRequest.id}`,
      }
    );
  }

  return buyRequest;
}

async function getBuyRequestById(buyRequestId: string) {
  const buyRequest = await prisma.buyRequest.findUnique({
    where: { id: buyRequestId },
    include: {
      buyer: {
        select: { id: true, username: true, profilePhoto: true },
      },
    },
  });

  if (!buyRequest) {
    throw new AppError("Buy request not found", 404, "NOT_FOUND");
  }

  // Lazy expiry check
  if (buyRequest.isActive && buyRequest.expiresAt < new Date()) {
    await prisma.buyRequest.update({
      where: { id: buyRequestId },
      data: { isActive: false },
    });
    return { ...buyRequest, isActive: false };
  }

  // Enrich with buyer stats
  const [totalTrades, ratingAgg] = await Promise.all([
    prisma.trade.count({
      where: {
        OR: [
          { buyerId: buyRequest.buyerId },
          { sellerId: buyRequest.buyerId },
        ],
      },
    }),
    prisma.review.aggregate({
      where: { revieweeId: buyRequest.buyerId },
      _avg: { rating: true },
    }),
  ]);

  return {
    ...buyRequest,
    buyer: {
      ...buyRequest.buyer,
      rating: Math.round((ratingAgg._avg.rating ?? 0) * 100) / 100,
      totalTrades,
    },
  };
}

async function getBuyRequests(filters: GetBuyRequestsFilters) {
  // Expire stale requests first
  await expireStale();

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    isActive: true,
    expiresAt: { gt: new Date() },
  };

  if (filters.excludeBuyerId) {
    where.buyerId = { not: filters.excludeBuyerId };
  }

  if (filters.asset) {
    where.asset = filters.asset;
  }

  if (filters.paymentMethod) {
    where.paymentMethod = filters.paymentMethod;
  }

  const [buyRequests, total] = await Promise.all([
    prisma.buyRequest.findMany({
      where,
      include: {
        buyer: {
          select: {
            id: true,
            username: true,
            profilePhoto: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.buyRequest.count({ where }),
  ]);

  // Gather buyer stats
  const buyerIds = [...new Set(buyRequests.map((br) => br.buyerId))];

  const [tradeCounts, ratings] = await Promise.all([
    Promise.all(
      buyerIds.map(async (bid) => ({
        buyerId: bid,
        count: await prisma.trade.count({
          where: { OR: [{ buyerId: bid }, { sellerId: bid }] },
        }),
      }))
    ),
    Promise.all(
      buyerIds.map(async (bid) => ({
        buyerId: bid,
        rating:
          (
            await prisma.review.aggregate({
              where: { revieweeId: bid },
              _avg: { rating: true },
            })
          )._avg.rating ?? 0,
      }))
    ),
  ]);

  const tradeCountMap = new Map(tradeCounts.map((t) => [t.buyerId, t.count]));
  const ratingMap = new Map(ratings.map((r) => [r.buyerId, r.rating]));

  const hasLocation =
    filters.latitude !== undefined && filters.longitude !== undefined;

  const AUTO_TIERS = [10, 50, 100] as const;
  const TIER_LABELS: Record<number, string> = {
    10: "10 km", 50: "50 km", 100: "100 km", 500: "City", 2000: "Country", 0: "Global",
  };
  const NEXT_TIER: Record<number, number | null> = {
    10: 50, 50: 100, 100: 500, 500: 2000, 2000: 0, 0: null,
  };

  const enriched = buyRequests
    .map((br) => {
      const buyerTrades = tradeCountMap.get(br.buyerId) ?? 0;
      const buyerRating = ratingMap.get(br.buyerId) ?? 0;

      let distance: number | null = null;
      if (hasLocation) {
        distance = haversineDistance(
          filters.latitude!,
          filters.longitude!,
          br.latitude,
          br.longitude
        );
        if (filters.radius !== undefined && filters.radius > 0 && distance > filters.radius) {
          return null;
        }
      }

      return {
        ...br,
        buyer: {
          id: br.buyer.id,
          username: br.buyer.username,
          profilePhoto: br.buyer.profilePhoto,
          rating: Math.round(buyerRating * 100) / 100,
          totalTrades: buyerTrades,
        },
        distance: distance !== null ? Math.round(distance * 10) / 10 : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  // Helper: find next tier that has more results than current count
  function findNextWithResults(afterTier: number, currentCount: number): number | null {
    let candidate = NEXT_TIER[afterTier] ?? null;
    while (candidate !== null) {
      const inCandidate =
        candidate === 0
          ? enriched
          : enriched.filter((item) => item.distance !== null && item.distance <= candidate!);
      if (inCandidate.length > currentCount) return candidate;
      candidate = NEXT_TIER[candidate] ?? null;
    }
    return null;
  }

  // Auto-tier if no explicit radius
  if (hasLocation && filters.radius === undefined) {
    for (const tier of AUTO_TIERS) {
      const inTier = enriched.filter(
        (item) => item.distance !== null && item.distance <= tier
      );

      if (inTier.length > 0) {
        return {
          items: inTier,
          total: inTier.length,
          page,
          pageSize: limit,
          hasMore: false,
          radius: tier,
          radiusLabel: TIER_LABELS[tier],
          nextRadius: findNextWithResults(tier, inTier.length),
        };
      }
    }

    // Nothing within 100km — find first manual tier with results
    const nextWithResults = findNextWithResults(100, 0);
    return {
      items: [],
      total: 0,
      page,
      pageSize: limit,
      hasMore: false,
      radius: 100,
      radiusLabel: "100 km",
      nextRadius: nextWithResults,
    };
  }

  // Explicit radius provided
  return {
    items: enriched,
    total: hasLocation ? enriched.length : total,
    page,
    pageSize: limit,
    hasMore: hasLocation ? false : skip + limit < total,
    radius: filters.radius ?? null,
    radiusLabel: filters.radius !== undefined ? (TIER_LABELS[filters.radius] || `${filters.radius} km`) : null,
    nextRadius: hasLocation && filters.radius !== undefined
      ? findNextWithResults(filters.radius, enriched.length)
      : null,
  };
}

async function getMyBuyRequests(userId: string) {
  // Expire stale first
  await expireStale();

  const buyRequests = await prisma.buyRequest.findMany({
    where: { buyerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return buyRequests;
}

async function cancelBuyRequest(buyRequestId: string, userId: string) {
  const buyRequest = await prisma.buyRequest.findUnique({
    where: { id: buyRequestId },
  });

  if (!buyRequest) {
    throw new AppError("Buy request not found", 404, "NOT_FOUND");
  }

  if (buyRequest.buyerId !== userId) {
    throw new AppError(
      "You can only cancel your own buy requests",
      403,
      "FORBIDDEN"
    );
  }

  if (!buyRequest.isActive) {
    throw new AppError("Buy request is already inactive", 400, "ALREADY_INACTIVE");
  }

  const updated = await prisma.buyRequest.update({
    where: { id: buyRequestId },
    data: { isActive: false },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const buyRequestService = {
  createBuyRequest,
  getBuyRequestById,
  getBuyRequests,
  getMyBuyRequests,
  cancelBuyRequest,
};

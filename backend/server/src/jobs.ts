/**
 * Background maintenance jobs. On an always-on host they run on timers from
 * src/index.ts; on serverless they are triggered through /api/v1/jobs/run.
 */

export async function refreshListingLiquidity(): Promise<number> {
  const { prisma } = await import("./lib/prisma");
  const { listingService } = await import("./services/listing.service");
  const activeListings = await prisma.listing.findMany({
    where: { isActive: true },
    select: { id: true, sellerId: true },
  });
  for (const listing of activeListings) {
    try {
      await listingService.refreshLiquidity(listing.id, listing.sellerId);
    } catch {
      // Skip — wallet might not be connected
    }
  }
  return activeListings.length;
}

export async function autoCancelExpiredTrades(): Promise<{ checked: number; cancelled: number }> {
  const { prisma } = await import("./lib/prisma");
  const { tradeService } = await import("./services/trade.service");
  const { escrowRefundService } = await import("./services/escrow-refund.service");
  const { notificationService } = await import("./services/notification.service");

  // Only cancels ESCROW_LOCKED trades (before payment marked)
  const expired = await prisma.trade.findMany({
    where: {
      status: "ESCROW_LOCKED",
      paymentDeadline: { lt: new Date() },
    },
    select: {
      id: true, sellerId: true, chain: true, asset: true, escrowTxSignature: true,
      seller: { select: { walletAddress: true } },
      buyer: { select: { walletAddress: true } },
    },
  });

  let cancelled = 0;
  for (const trade of expired) {
    try {
      // SOL/ETH: refund on-chain first, only cancel DB if refund succeeds or escrow doesn't exist
      if (trade.chain !== "bitcoin" && trade.escrowTxSignature) {
        console.log(`[auto-cancel] Attempting on-chain refund for ${trade.id} | chain: ${trade.chain} | asset: ${trade.asset}`);
        const result = await escrowRefundService.autoRefund(trade);
        if (!result) {
          console.error(`[auto-cancel] On-chain refund failed for ${trade.id} (${trade.chain}) — will retry next cycle`);
          continue; // Don't cancel in DB — retry next cycle
        }
        if (result !== "no_escrow") {
          console.log(`[auto-cancel] On-chain refund: ${result}`);
          await notificationService.create({
            userId: trade.sellerId,
            type: "trade-update",
            title: `Trade expired — ${trade.asset} refunded to your wallet`,
            subtitle: "Buyer didn't pay within 24 hours. Your funds have been returned automatically.",
            link: `/trade/${trade.id}`,
          });
        } else {
          console.log(`[auto-cancel] No on-chain escrow for ${trade.id} — safe to cancel`);
        }
      }

      // BTC: can't refund server-side, notify seller to claim manually
      if (trade.chain === "bitcoin" && trade.escrowTxSignature) {
        await notificationService.create({
          userId: trade.sellerId,
          type: "trade-update",
          title: `Trade expired — claim your BTC refund`,
          subtitle: "Buyer didn't pay within 24 hours. Visit the trade page to claim your BTC back.",
          link: `/trade/${trade.id}`,
        });
      }

      // Cancel in DB (notifies both parties)
      await tradeService.cancelTrade(trade.id, trade.sellerId);
      cancelled += 1;
      console.log(`[auto-cancel] Trade ${trade.id} — expired, chain: ${trade.chain}`);
    } catch (err: any) {
      console.error(`[auto-cancel] Failed for ${trade.id}:`, err.message);
    }
  }
  return { checked: expired.length, cancelled };
}

export async function runAllJobs() {
  const liquidity = await refreshListingLiquidity().catch((err) => {
    console.error("[liquidity] Refresh failed:", err);
    return -1;
  });
  const autoCancel = await autoCancelExpiredTrades().catch((err) => {
    console.error("[auto-cancel] Check failed:", err);
    return { checked: -1, cancelled: 0 };
  });
  return { liquidityRefreshed: liquidity, ...autoCancel, ranAt: new Date().toISOString() };
}

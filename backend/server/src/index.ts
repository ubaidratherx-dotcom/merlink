import "./env"; // Must be first — loads .env before any other module reads process.env

import path from "path";
import express from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { setupSocket } from "./socket";
import { apiLimiter } from "./middleware/rateLimit";

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(
  cors({
    origin: [process.env.CORS_ORIGIN || "http://localhost:3000", "https://taxaceous-anton-untoughly.ngrok-free.dev", `http://172.20.10.93:3000`],
    credentials: true,
  })
);

// Save raw body for webhook signature verification (must be before express.json())
app.use("/api/v1/kyc/webhook", express.raw({ type: "application/json" }));

// Parse JSON for everything else
app.use(express.json());

// Global rate limiting (production only)
if (process.env.NODE_ENV !== "development") {
  app.use(apiLimiter);
}

// Serve uploaded files
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1", apiRouter);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const io = setupSocket(server);

// ---------------------------------------------------------------------------
// Error handling (must be registered after routes)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || "4000", 10);

server.listen(PORT, () => {
  console.log(`[merlink] Server listening on port ${PORT}`);

  // Background job: refresh all active listing liquidity every 5 minutes
  setInterval(async () => {
    try {
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
      if (activeListings.length > 0) {
        console.log(`[liquidity] Refreshed ${activeListings.length} listings`);
      }
    } catch (err) {
      console.error("[liquidity] Background refresh failed:", err);
    }
  }, 5 * 60 * 1000); // every 5 minutes

  // Background job: auto-cancel trades where 24h payment deadline expired
  // Only cancels ESCROW_LOCKED trades (before payment marked)
  setInterval(async () => {
    try {
      const { prisma } = await import("./lib/prisma");
      const { tradeService } = await import("./services/trade.service");
      const { escrowRefundService } = await import("./services/escrow-refund.service");
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
      const { notificationService } = await import("./services/notification.service");
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
              title: `Trade expired — claim your BTC refund`,
              subtitle: "Buyer didn't pay within 24 hours. Visit the trade page to claim your BTC back.",
              link: `/trade/${trade.id}`,
            });
          }

          // Cancel in DB (notifies both parties)
          await tradeService.cancelTrade(trade.id, trade.sellerId);
          console.log(`[auto-cancel] Trade ${trade.id} — expired, chain: ${trade.chain}`);
        } catch (err: any) {
          console.error(`[auto-cancel] Failed for ${trade.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[auto-cancel] Background check failed:", err);
    }
  }, 10 * 60 * 1000); // every 10 minutes
});

export { app, server, io };

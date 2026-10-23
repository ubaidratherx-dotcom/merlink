import path from "path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import { fileStoreService } from "./services/fileStore.service";

/**
 * Builds the Express app without binding a port or a websocket server, so the
 * same app can run on an always-on host (src/index.ts) or as a serverless
 * function (src/vercel.ts).
 */
export function createApp() {
  const app = express();

  // Behind Vercel / any reverse proxy: trust the first hop for req.ip
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const configuredOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: [
        ...configuredOrigins,
        "https://taxaceous-anton-untoughly.ngrok-free.dev",
        "http://172.20.10.93:3000",
      ],
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

  // Uploaded files: legacy files on local disk first, then the database-backed store
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));
  app.get("/uploads/:id", async (req, res, next) => {
    try {
      const file = await fileStoreService.get(req.params.id);
      if (!file) {
        res.status(404).json({ error: { message: "File not found", code: "NOT_FOUND" } });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Length", String(file.size));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(Buffer.from(file.data));
    } catch (err) {
      next(err);
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiRouter);

  // Error handling (must be registered after routes)
  app.use(errorHandler);

  return app;
}

export const app = createApp();

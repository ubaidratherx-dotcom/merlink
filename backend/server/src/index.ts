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
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Save raw body for webhook signature verification (must be before express.json())
app.use("/api/v1/kyc/webhook", express.raw({ type: "application/json" }));

// Parse JSON for everything else
app.use(express.json());

// Global rate limiting
app.use(apiLimiter);

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
});

export { app, server, io };

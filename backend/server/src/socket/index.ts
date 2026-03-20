import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../middleware/auth";

let io: SocketServer;

/**
 * Creates a Socket.io server attached to the given HTTP server and sets up
 * the `/trade` and `/chat` namespaces.
 */
export function setupSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true,
    },
  });

  // -----------------------------------------------------------------------
  // Auth middleware – applies to every namespace
  // -----------------------------------------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      return next(new Error("Server misconfiguration"));
    }

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  // -----------------------------------------------------------------------
  // /trade namespace – trade status updates
  // -----------------------------------------------------------------------
  const tradeNs = io.of("/trade");

  tradeNs.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));

    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return next(new Error("Server misconfiguration"));

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  tradeNs.on("connection", (socket) => {
    const user = socket.data.user as JwtPayload;
    console.log(`[trade] ${user.username} connected`);

    socket.on("join-trade", (tradeId: string) => {
      socket.join(`trade:${tradeId}`);
    });

    socket.on("leave-trade", (tradeId: string) => {
      socket.leave(`trade:${tradeId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[trade] ${user.username} disconnected`);
    });
  });

  // -----------------------------------------------------------------------
  // /chat namespace – trade chat messages
  // -----------------------------------------------------------------------
  const chatNs = io.of("/chat");

  chatNs.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));

    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return next(new Error("Server misconfiguration"));

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  chatNs.on("connection", (socket) => {
    const user = socket.data.user as JwtPayload;
    console.log(`[chat] ${user.username} connected`);

    socket.on("join-chat", (tradeId: string) => {
      socket.join(`chat:${tradeId}`);
    });

    socket.on("leave-chat", (tradeId: string) => {
      socket.leave(`chat:${tradeId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[chat] ${user.username} disconnected`);
    });
  });

  return io;
}

export { io };

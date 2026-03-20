import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface JwtPayload {
  userId: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }
  return jwt.verify(token, secret) as JwtPayload;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Requires a valid JWT. Responds with 401 if missing or invalid.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHORIZED" } });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: { message: "Invalid or expired token", code: "UNAUTHORIZED" } });
  }
}

/**
 * Attaches the user if a valid token is present but does **not** reject
 * unauthenticated requests.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  next();
}

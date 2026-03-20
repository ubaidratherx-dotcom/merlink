import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Error response shape
// ---------------------------------------------------------------------------
interface ApiError {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiError>,
  _next: NextFunction
): void {
  // --- Known application error -------------------------------------------
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { message: err.message, code: err.code },
    });
    return;
  }

  // --- Zod validation error ----------------------------------------------
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  // --- Prisma known-request error ----------------------------------------
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const target = (err.meta?.target as string[]) ?? [];
        res.status(409).json({
          error: {
            message: `Unique constraint violation on: ${target.join(", ")}`,
            code: "CONFLICT",
          },
        });
        return;
      }
      case "P2025":
        res.status(404).json({
          error: { message: "Record not found", code: "NOT_FOUND" },
        });
        return;
      default:
        break;
    }
  }

  // --- Prisma validation error -------------------------------------------
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      error: { message: "Invalid database query", code: "BAD_REQUEST" },
    });
    return;
  }

  // --- Fallback ----------------------------------------------------------
  console.error("[merlink] Unhandled error:", err);
  res.status(500).json({
    error: {
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
      code: "INTERNAL_ERROR",
    },
  });
}

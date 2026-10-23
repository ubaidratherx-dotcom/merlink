import rateLimit from "express-rate-limit";

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMIT_EXCEEDED" } },
});

// Strict limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many authentication attempts, please try again later", code: "RATE_LIMIT_EXCEEDED" } },
});

// OTP limiter — very strict
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === "development" ? 50 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many OTP requests, please wait before trying again", code: "RATE_LIMIT_EXCEEDED" } },
});

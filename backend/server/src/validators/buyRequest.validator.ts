import { z } from "zod";

const paymentMethodEnum = z.enum([
  "BANK_TRANSFER",
  "CASH",
  "WISE",
  "REVOLUT",
  "MOBILE_MONEY",
  "PAYPAL",
  "OTHER",
]);

export const createBuyRequestSchema = z.object({
  asset: z.enum(["USDC", "USDT", "SOL", "ETH", "BTC"]),
  amount: z.number().positive(),
  paymentMethod: paymentMethodEnum,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const getBuyRequestsQuerySchema = z.object({
  asset: z.enum(["USDC", "USDT", "SOL", "ETH", "BTC"]).optional(),
  paymentMethod: paymentMethodEnum.optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radius: z.coerce.number().default(100).optional(),
  page: z.coerce.number().default(1).optional(),
  limit: z.coerce.number().default(20).optional(),
});

export const buyRequestParamsSchema = z.object({
  id: z.string(),
});

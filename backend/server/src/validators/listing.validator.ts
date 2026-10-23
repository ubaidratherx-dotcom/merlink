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

export const createListingSchema = z
  .object({
    asset: z.enum(["USDC", "USDT", "SOL", "ETH", "BTC"]),
    chain: z.enum(["solana", "ethereum", "bitcoin"]).default("solana"),
    priceType: z.enum(["FIXED", "MARKET_PLUS", "MARKET_MINUS"]).default("FIXED"),
    priceValue: z.number().positive(),
    minAmount: z.number().positive(),
    maxAmount: z.number().positive(),
    paymentMethods: z.array(paymentMethodEnum).min(1),
    tradeType: z.enum(["IN_PERSON", "REMOTE", "BOTH"]),
    paymentInstructions: z.string().max(500).optional(),
  })
  .refine((data) => data.maxAmount > data.minAmount, {
    message: "Maximum amount must be greater than minimum amount",
  });

export const updateListingSchema = z.object({
  priceType: z.enum(["FIXED", "MARKET_PLUS", "MARKET_MINUS"]).optional(),
  priceValue: z.number().positive().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  paymentMethods: z.array(paymentMethodEnum).min(1).optional(),
  tradeType: z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  paymentInstructions: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const updateListingParamsSchema = z.object({
  listingId: z.string(),
});

export const getListingsQuerySchema = z.object({
  asset: z.enum(["USDC", "USDT", "SOL", "ETH", "BTC"]).optional(),
  paymentMethod: paymentMethodEnum.optional(),
  tradeType: z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radius: z.coerce.number().default(100).optional(),
  excludeSellerId: z.string().optional(),
  page: z.coerce.number().default(1).optional(),
  limit: z.coerce.number().default(20).optional(),
});

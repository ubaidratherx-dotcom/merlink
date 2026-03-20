import { z } from "zod";

export const verifyWalletSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  signature: z.string().min(1),
  message: z.string().min(1),
});

export const disconnectWalletSchema = z.object({});

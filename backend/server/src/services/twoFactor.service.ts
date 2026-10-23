import { generateSecret as otpGenerateSecret, generateURI, verifySync } from "otplib";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

const APP_NAME = "Merlink";

/**
 * Generate a new TOTP secret and QR code for the user.
 * Does NOT enable 2FA yet — user must verify a code first.
 */
async function generateSecret(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
  if (user.twoFactorEnabled) throw new AppError("2FA is already enabled", 400, "ALREADY_ENABLED");

  const secret = otpGenerateSecret();
  const otpauth = generateURI({ issuer: APP_NAME, label: user.email || user.username, secret });
  const QRCode = await import("qrcode");
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  // Store secret temporarily (not enabled until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret },
  });

  return { secret, qrCodeDataUrl };
}

/**
 * Verify a TOTP code and enable 2FA if correct.
 */
async function verifyAndEnable(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
  if (!user.twoFactorSecret) throw new AppError("No 2FA setup in progress", 400, "NO_SECRET");
  if (user.twoFactorEnabled) throw new AppError("2FA is already enabled", 400, "ALREADY_ENABLED");

  const isValid = verifySync({ token: code, secret: user.twoFactorSecret }).valid;
  if (!isValid) throw new AppError("Invalid code", 400, "INVALID_CODE");

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });

  return true;
}

/**
 * Verify a TOTP code during login.
 */
function verifyCode(secret: string, code: string): boolean {
  return verifySync({ token: code, secret }).valid;
}

/**
 * Disable 2FA (requires valid code).
 */
async function disable(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError("2FA is not enabled", 400, "NOT_ENABLED");
  }

  const isValid = verifySync({ token: code, secret: user.twoFactorSecret }).valid;
  if (!isValid) throw new AppError("Invalid code", 400, "INVALID_CODE");

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return true;
}

export const twoFactorService = {
  generateSecret,
  verifyAndEnable,
  verifyCode,
  disable,
};

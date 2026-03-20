import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Send verification email
// ---------------------------------------------------------------------------

async function sendVerificationEmail(userId: string, email: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.emailVerification.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  // In production, send an actual email. For MVP dev, console.log the link.
  console.log(
    `[DEV EMAIL] To: ${email} — Verification link: http://localhost:3000/verify-email?token=${token}`
  );

  return { message: "Verification email sent" };
}

// ---------------------------------------------------------------------------
// Verify email token
// ---------------------------------------------------------------------------

async function verifyEmail(token: string) {
  const record = await prisma.emailVerification.findUnique({
    where: { token },
  });

  if (!record) {
    throw new AppError("Invalid verification token", 400, "BAD_REQUEST");
  }

  if (record.verified) {
    throw new AppError("Email already verified", 400, "BAD_REQUEST");
  }

  if (record.expiresAt < new Date()) {
    throw new AppError("Verification token has expired", 400, "TOKEN_EXPIRED");
  }

  // Mark token as verified and update user account status
  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: record.id },
      data: { verified: true },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { accountStatus: "PHONE_VERIFIED" },
    }),
  ]);

  return { message: "Email verified successfully" };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const emailService = {
  sendVerificationEmail,
  verifyEmail,
};

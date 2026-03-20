import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Request password reset
// ---------------------------------------------------------------------------

async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Return success even if user not found to prevent email enumeration
    return { message: "If an account with that email exists, a reset link has been sent" };
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  // In production, send an actual email. For MVP dev, console.log the link.
  console.log(
    `[DEV EMAIL] Password reset link: http://localhost:3000/reset-password?token=${token}`
  );

  return { message: "If an account with that email exists, a reset link has been sent" };
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordReset.findUnique({
    where: { token },
  });

  if (!record) {
    throw new AppError("Invalid reset token", 400, "BAD_REQUEST");
  }

  if (record.used) {
    throw new AppError("Reset token has already been used", 400, "BAD_REQUEST");
  }

  if (record.expiresAt < new Date()) {
    throw new AppError("Reset token has expired", 400, "TOKEN_EXPIRED");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.passwordReset.update({
      where: { id: record.id },
      data: { used: true },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
  ]);

  return { message: "Password reset successfully" };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const passwordService = {
  requestPasswordReset,
  resetPassword,
};

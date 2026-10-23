import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Delivery: Resend when RESEND_API_KEY is set, otherwise the server console
// ---------------------------------------------------------------------------

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function deliver(to: string, subject: string, text: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[DEV EMAIL] To: ${to} — ${subject}\n${text}`);
    return;
  }
  const from = process.env.MAIL_FROM || "Merlink <noreply@merlink.growyoursaas.io>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    console.error(`[email] Resend request failed (${res.status}): ${await res.text()}`);
  }
}

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0B0B0C;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#F5F5F7">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:800;letter-spacing:-0.03em;margin:0 0 24px;color:#9B8BFF">Merlink</p>
    <h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#A5A5B0;margin:0 0 24px">${body}</p>
    <a href="${cta.url}" style="display:inline-block;background:#7B5EFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">${cta.label}</a>
    <p style="font-size:12px;color:#6F6F7A;margin:28px 0 0">If the button does not work, open this link:<br><a href="${cta.url}" style="color:#9B8BFF">${cta.url}</a></p>
  </div></body></html>`;
}

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

  const url = `${appUrl()}/verify-email?token=${token}`;
  await deliver(
    email,
    "Verify your Merlink email",
    `Confirm your email address to finish setting up Merlink: ${url}`,
    layout("Confirm your email", "Tap the button below to confirm this address. The link is valid for 24 hours.", { label: "Verify email", url })
  );

  return { message: "Verification email sent" };
}

// ---------------------------------------------------------------------------
// Send password reset email
// ---------------------------------------------------------------------------

async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl()}/reset-password?token=${token}`;
  await deliver(
    email,
    "Reset your Merlink password",
    `Reset your password here (valid for one hour): ${url}`,
    layout("Reset your password", "Someone asked to reset the password for this account. If that was you, use the button below. The link is valid for one hour.", { label: "Choose a new password", url })
  );
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
  sendPasswordResetEmail,
  verifyEmail,
};

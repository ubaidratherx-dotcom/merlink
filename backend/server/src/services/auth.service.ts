import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sanitizeUsername } from "@merlink/utils";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import type { JwtPayload } from "../middleware/auth";
import { emailService } from "./email.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeUser(user: Record<string, unknown>) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

async function generateTokens(userId: string, username: string) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new AppError("JWT secrets are not configured", 500);
  }

  const accessExpirySec = parseInt(process.env.JWT_ACCESS_EXPIRY_SEC || "900", 10); // 15 min
  const refreshExpirySec = parseInt(process.env.JWT_REFRESH_EXPIRY_SEC || "604800", 10); // 7 days

  const accessToken = jwt.sign(
    { userId, username } as JwtPayload,
    accessSecret,
    { expiresIn: accessExpirySec }
  );

  const refreshToken = jwt.sign(
    { userId, username } as JwtPayload,
    refreshSecret,
    { expiresIn: refreshExpirySec }
  );

  // Calculate refresh token expiry date
  const expiresAt = new Date(Date.now() + refreshExpirySec * 1000);

  // Store refresh token in DB
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}


// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

async function register(data: {
  username: string;
  phone?: string;
  email?: string;
  password?: string;
}) {
  // Sanitize username
  const cleanUsername = sanitizeUsername(data.username);

  // Check username uniqueness
  const existingUsername = await prisma.user.findUnique({
    where: { username: cleanUsername },
  });
  if (existingUsername) {
    throw new AppError("Username already taken", 409, "CONFLICT");
  }

  // Determine auth provider
  const authProvider = data.email ? "EMAIL" : "PHONE";

  let passwordHash: string | undefined;

  if (data.email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      throw new AppError("Email already registered", 409, "CONFLICT");
    }
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }
  }

  if (data.phone) {
    const existingPhone = await prisma.user.findUnique({
      where: { phone: data.phone },
    });
    if (existingPhone) {
      throw new AppError("Phone number already registered", 409, "CONFLICT");
    }
  }

  const user = await prisma.user.create({
    data: {
      username: cleanUsername,
      email: data.email || null,
      phone: data.phone || null,
      passwordHash: passwordHash || null,
      authProvider: authProvider as "PHONE" | "EMAIL",
      accountStatus: "UNVERIFIED",
    },
  });

  // Send verification email for email-based registration
  if (data.email) {
    await emailService.sendVerificationEmail(user.id, data.email);
  }

  const tokens = await generateTokens(user.id, user.username);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ---------------------------------------------------------------------------
// Login with email
// ---------------------------------------------------------------------------

async function loginWithEmail(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError("Invalid email or password", 401, "UNAUTHORIZED");
  }

  if (!user.passwordHash) {
    throw new AppError("Invalid email or password", 401, "UNAUTHORIZED");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password", 401, "UNAUTHORIZED");
  }

  const tokens = await generateTokens(user.id, user.username);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ---------------------------------------------------------------------------
// Login with phone (sends OTP)
// ---------------------------------------------------------------------------

async function loginWithPhone(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new AppError("No account found with this phone number", 404, "NOT_FOUND");
  }

  const code = generateOtpCode();

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      phone,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
    },
  });

  console.log(`[DEV OTP] Phone: ${phone}, Code: ${code}`);

  return { message: "OTP sent" };
}

// ---------------------------------------------------------------------------
// Send OTP
// ---------------------------------------------------------------------------

async function sendOtp(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new AppError("No account found with this phone number", 404, "NOT_FOUND");
  }

  const code = generateOtpCode();

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      phone,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  });

  console.log(`[DEV OTP] Phone: ${phone}, Code: ${code}`);

  return { message: "OTP sent" };
}

// ---------------------------------------------------------------------------
// Verify OTP
// ---------------------------------------------------------------------------

async function verifyOtp(phone: string, code: string) {
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    throw new AppError("No valid OTP found. Please request a new one.", 400, "BAD_REQUEST");
  }

  if (otpRecord.attempts >= 5) {
    throw new AppError("Too many attempts. Please request a new OTP.", 429, "TOO_MANY_ATTEMPTS");
  }

  // Increment attempts
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { attempts: { increment: 1 } },
  });

  if (otpRecord.code !== code) {
    throw new AppError("Invalid OTP code", 400, "BAD_REQUEST");
  }

  // Mark OTP as verified
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { verified: true },
  });

  // Update user account status
  const user = await prisma.user.update({
    where: { id: otpRecord.userId },
    data: { accountStatus: "PHONE_VERIFIED" },
  });

  const tokens = await generateTokens(user.id, user.username);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ---------------------------------------------------------------------------
// Refresh access token
// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshToken: string) {
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new AppError("JWT secrets are not configured", 500);
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, refreshSecret) as JwtPayload;
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "UNAUTHORIZED");
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new AppError("Invalid or expired refresh token", 401, "UNAUTHORIZED");
  }

  // Delete old refresh token
  await prisma.refreshToken.delete({
    where: { id: storedToken.id },
  });

  // Generate new token pair
  const tokens = await generateTokens(payload.userId, payload.username);

  return tokens;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const authService = {
  register,
  loginWithEmail,
  loginWithPhone,
  sendOtp,
  verifyOtp,
  generateTokens,
  refreshAccessToken,
  logout,
  sanitizeUser,
};

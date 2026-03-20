import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || "https://api.sumsub.com";
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || "basic-kyc-level";

function getConfig() {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  if (!appToken || !secretKey) {
    throw new AppError("Sumsub credentials are not configured", 500);
  }
  return { appToken, secretKey };
}

// ---------------------------------------------------------------------------
// Request signing (Sumsub HMAC-SHA256)
// ---------------------------------------------------------------------------

function signRequest(
  method: string,
  url: string,
  timestamp: number,
  body: string | undefined,
  secretKey: string
): string {
  const data = timestamp + method.toUpperCase() + url + (body || "");
  return crypto.createHmac("sha256", secretKey).update(data).digest("hex");
}

async function sumsubRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const { appToken, secretKey } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const signature = signRequest(method, path, timestamp, bodyStr, secretKey);

  const headers: Record<string, string> = {
    "X-App-Token": appToken,
    "X-App-Access-Sig": signature,
    "X-App-Access-Ts": String(timestamp),
    Accept: "application/json",
  };

  if (bodyStr) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${SUMSUB_BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[KYC] Sumsub API error:", data);
    throw new AppError(
      `Sumsub API error: ${(data as Record<string, unknown>).description || response.statusText}`,
      response.status,
      "KYC_API_ERROR"
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Create applicant
// ---------------------------------------------------------------------------

interface UserInfo {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

async function createApplicant(userId: string, userInfo: UserInfo) {
  const path = `/resources/applicants?levelName=${SUMSUB_LEVEL_NAME}`;

  const body: Record<string, unknown> = {
    externalUserId: userId,
  };

  if (userInfo.email) body.email = userInfo.email;
  if (userInfo.phone) body.phone = userInfo.phone;

  if (userInfo.firstName || userInfo.lastName) {
    body.fixedInfo = {
      ...(userInfo.firstName && { firstName: userInfo.firstName }),
      ...(userInfo.lastName && { lastName: userInfo.lastName }),
    };
  }

  let result: { id: string; [key: string]: unknown };

  try {
    result = (await sumsubRequest("POST", path, body)) as {
      id: string;
      [key: string]: unknown;
    };
  } catch (err: unknown) {
    // Handle duplicate applicant — fetch existing instead
    if (
      err instanceof AppError &&
      err.message.includes("already exists")
    ) {
      const existing = await prisma.kycApplication.findUnique({
        where: { userId },
      });
      if (existing?.applicantId) {
        result = { id: existing.applicantId };
      } else {
        // Fetch from Sumsub by externalUserId
        const fetched = (await sumsubRequest(
          "GET",
          `/resources/applicants/-;externalUserId=${encodeURIComponent(userId)}`
        )) as { items?: Array<{ id: string }> };
        if (fetched.items && fetched.items.length > 0) {
          result = { id: fetched.items[0].id };
        } else {
          throw err;
        }
      }
    } else {
      throw err;
    }
  }

  // Upsert the KYC application record
  await prisma.kycApplication.upsert({
    where: { userId },
    create: {
      userId,
      applicantId: result.id,
      levelName: SUMSUB_LEVEL_NAME,
    },
    update: {
      applicantId: result.id,
    },
  });

  // Update user KYC status to PENDING
  await prisma.user.update({
    where: { id: userId },
    data: { kycStatus: "PENDING" },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Get access token for Web SDK
// ---------------------------------------------------------------------------

async function getAccessToken(userId: string): Promise<string> {
  const path = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${SUMSUB_LEVEL_NAME}`;

  const result = (await sumsubRequest("POST", path)) as {
    token: string;
    [key: string]: unknown;
  };

  return result.token;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secretKey: string
): boolean {
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(signature, "hex")
  );
}

interface WebhookPayload {
  type: string;
  applicantId: string;
  externalUserId: string;
  reviewResult?: {
    reviewAnswer: string;
    rejectLabels?: string[];
    moderationComment?: string;
  };
  [key: string]: unknown;
}

async function handleWebhook(payload: WebhookPayload, signature: string, rawBody: Buffer) {
  const { secretKey } = getConfig();

  // Verify signature using the raw body bytes for accurate HMAC verification
  const isValid = verifyWebhookSignature(rawBody.toString("utf8"), signature, secretKey);

  if (!isValid) {
    throw new AppError("Invalid webhook signature", 401, "UNAUTHORIZED");
  }

  const { type, externalUserId, reviewResult } = payload;

  switch (type) {
    case "applicantReviewed": {
      if (!reviewResult) break;

      const reviewAnswer = reviewResult.reviewAnswer;
      const kycStatus = reviewAnswer === "GREEN" ? "VERIFIED" : "REJECTED";

      await prisma.$transaction([
        prisma.user.update({
          where: { id: externalUserId },
          data: { kycStatus },
        }),
        prisma.kycApplication.update({
          where: { userId: externalUserId },
          data: {
            reviewStatus: reviewAnswer,
            reviewComment: reviewResult.moderationComment || null,
          },
        }),
      ]);
      break;
    }

    case "applicantPending": {
      await prisma.user.update({
        where: { id: externalUserId },
        data: { kycStatus: "PENDING" },
      });
      break;
    }

    default:
      console.log(`[KYC] Unhandled webhook event type: ${type}`);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Get applicant status
// ---------------------------------------------------------------------------

async function getApplicantStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });

  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  const kycApplication = await prisma.kycApplication.findUnique({
    where: { userId },
    select: { applicantId: true },
  });

  return {
    kycStatus: user.kycStatus,
    applicantId: kycApplication?.applicantId || null,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const kycService = {
  createApplicant,
  getAccessToken,
  handleWebhook,
  getApplicantStatus,
};

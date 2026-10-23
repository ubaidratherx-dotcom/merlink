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
    if (err instanceof AppError) {
      if (err.message.includes("already exists") || err.message.toLowerCase().includes("deactivated")) {
        // Applicant already exists (possibly deactivated) — resolve their id and reset to reactivate

        // 1. Try extracting applicantId directly from the "already exists: <id>" error message
        const idFromError = err.message.match(/already exists:\s*([a-f0-9]+)/i)?.[1] ?? null;

        // 2. Fall back to DB, then Sumsub GET
        const existing = await prisma.kycApplication.findUnique({ where: { userId } });
        let applicantId: string | null = idFromError || existing?.applicantId || null;

        if (!applicantId) {
          const fetched = (await sumsubRequest(
            "GET",
            `/resources/applicants/-;externalUserId=${encodeURIComponent(userId)}`
          )) as { items?: Array<{ id: string }> };
          if (fetched.items && fetched.items.length > 0) {
            applicantId = fetched.items[0].id;
          } else {
            throw err;
          }
        }

        // Reset to clear previously submitted docs (no-op if nothing to clear)
        // If Sumsub rejects reset (e.g. fully deactivated in dashboard), log and continue —
        // the access token call below will surface a meaningful error if truly unrecoverable
        try {
          await sumsubRequest("POST", `/resources/applicants/${applicantId}/reset`);
          console.log(`[KYC] Reset applicant ${applicantId} for user ${userId}`);
        } catch (resetErr) {
          console.warn(`[KYC] Reset failed for applicant ${applicantId}, proceeding anyway:`, (resetErr as Error).message);
        }
        result = { id: applicantId };
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  // Upsert the KYC application record — do NOT change kycStatus here.
  // Status only moves via Sumsub webhooks (applicantPending → PENDING, etc.)
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
// Hard rejection labels — these trigger the hard-rejection path (max 1 retry)
// Soft rejections (document quality, expired ID, etc.) allow up to 5 retries
// ---------------------------------------------------------------------------

const HARD_REJECTION_LABELS = new Set([
  "DUPLICATE",
  "FRAUDULENT",
  "FINAL_REJECT",
  "COMPROMISED_PERSONS",
  "WRONG_USER_REGION",
  "SANCTIONS",
  "PEP",
  "ADVERSE_MEDIA",
]);

function isHardRejection(rejectLabels?: string[]): boolean {
  if (!rejectLabels || rejectLabels.length === 0) return false;
  return rejectLabels.some((label) => HARD_REJECTION_LABELS.has(label));
}

// ---------------------------------------------------------------------------
// Reset applicant in Sumsub — allows them to resubmit after hard rejection #1
// ---------------------------------------------------------------------------

async function resetApplicantInSumsub(applicantId: string): Promise<void> {
  try {
    await sumsubRequest("POST", `/resources/applicants/${applicantId}/reset`);
    console.log(`[KYC] Reset applicant ${applicantId} in Sumsub for resubmission`);
  } catch (err) {
    // Log but don't throw — DB state is the source of truth for retry gating
    console.error(`[KYC] Failed to reset applicant ${applicantId} in Sumsub:`, err);
  }
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
  // Sumsub webhooks are signed with a SEPARATE secret key per webhook handler
  // (configured in Sumsub Dashboard → Developer Tools → Webhooks → Secret Key)
  // This is different from SUMSUB_SECRET_KEY which is only for API request signing
  const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET || process.env.SUMSUB_SECRET_KEY;
  if (!webhookSecret) {
    throw new AppError("Sumsub webhook secret is not configured", 500);
  }

  const isValid = verifyWebhookSignature(rawBody.toString("utf8"), signature, webhookSecret);
  if (!isValid) {
    throw new AppError("Invalid webhook signature", 401, "UNAUTHORIZED");
  }

  const { type, applicantId, externalUserId, reviewResult } = payload;

  switch (type) {
    case "applicantReviewed": {
      if (!reviewResult) break;

      const reviewAnswer = reviewResult.reviewAnswer;

      if (reviewAnswer === "GREEN") {
        // Approved
        await prisma.$transaction([
          prisma.user.update({
            where: { id: externalUserId },
            data: { kycStatus: "VERIFIED" },
          }),
          prisma.kycApplication.update({
            where: { userId: externalUserId },
            data: {
              reviewStatus: "GREEN",
              reviewComment: reviewResult.moderationComment || null,
            },
          }),
        ]);
        console.log(`[KYC] User ${externalUserId} VERIFIED`);
        break;
      }

      // Rejection — determine hard vs soft
      const hard = isHardRejection(reviewResult.rejectLabels);
      const kycApp = await prisma.kycApplication.findUnique({
        where: { userId: externalUserId },
        select: { softRejections: true, hardRejections: true },
      });

      if (!kycApp) {
        console.error(`[KYC] No kycApplication found for user ${externalUserId}`);
        break;
      }

      if (hard) {
        const newHardCount = kycApp.hardRejections + 1;
        const permanently = newHardCount >= 2;

        await prisma.$transaction([
          prisma.user.update({
            where: { id: externalUserId },
            data: { kycStatus: permanently ? "PERMANENTLY_REJECTED" : "REJECTED" },
          }),
          prisma.kycApplication.update({
            where: { userId: externalUserId },
            data: {
              reviewStatus: "RED",
              reviewComment: reviewResult.moderationComment || null,
              hardRejections: newHardCount,
            },
          }),
        ]);

        if (!permanently && applicantId) {
          // Reset applicant in Sumsub so they can resubmit once more
          await resetApplicantInSumsub(applicantId);
        }

        console.log(`[KYC] User ${externalUserId} hard rejected (count=${newHardCount}, permanent=${permanently}), labels=${reviewResult.rejectLabels?.join(",")}`);
      } else {
        // Soft rejection
        const newSoftCount = kycApp.softRejections + 1;
        const permanently = newSoftCount >= 5;

        await prisma.$transaction([
          prisma.user.update({
            where: { id: externalUserId },
            data: { kycStatus: permanently ? "PERMANENTLY_REJECTED" : "REJECTED" },
          }),
          prisma.kycApplication.update({
            where: { userId: externalUserId },
            data: {
              reviewStatus: "RED",
              reviewComment: reviewResult.moderationComment || null,
              softRejections: newSoftCount,
            },
          }),
        ]);

        console.log(`[KYC] User ${externalUserId} soft rejected (count=${newSoftCount}, permanent=${permanently}), labels=${reviewResult.rejectLabels?.join(",")}`);
      }
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

async function syncFromSumsub(userId: string, applicantId: string): Promise<void> {
  try {
    const result = (await sumsubRequest(
      "GET",
      `/resources/applicants/${applicantId}/status`
    )) as {
      reviewStatus: string;
      reviewResult?: {
        reviewAnswer: string;
        rejectLabels?: string[];
        moderationComment?: string;
      };
    };

    if (result.reviewStatus !== "completed" || !result.reviewResult) return;

    const { reviewAnswer, rejectLabels, moderationComment } = result.reviewResult;

    if (reviewAnswer === "GREEN") {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { kycStatus: "VERIFIED" } }),
        prisma.kycApplication.update({ where: { userId }, data: { reviewStatus: "GREEN", reviewComment: moderationComment || null } }),
      ]);
      return;
    }

    // RED — determine hard vs soft
    const kycApp = await prisma.kycApplication.findUnique({
      where: { userId },
      select: { softRejections: true, hardRejections: true },
    });
    if (!kycApp) return;

    const hard = isHardRejection(rejectLabels);
    if (hard) {
      const newCount = kycApp.hardRejections + 1;
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { kycStatus: newCount >= 2 ? "PERMANENTLY_REJECTED" : "REJECTED" } }),
        prisma.kycApplication.update({ where: { userId }, data: { reviewStatus: "RED", reviewComment: moderationComment || null, hardRejections: newCount } }),
      ]);
      if (newCount < 2) await resetApplicantInSumsub(applicantId);
    } else {
      const newCount = kycApp.softRejections + 1;
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { kycStatus: newCount >= 5 ? "PERMANENTLY_REJECTED" : "REJECTED" } }),
        prisma.kycApplication.update({ where: { userId }, data: { reviewStatus: "RED", reviewComment: moderationComment || null, softRejections: newCount } }),
      ]);
    }
    console.log(`[KYC] Synced missed rejection for user ${userId} from Sumsub`);
  } catch (err) {
    // Non-fatal — just log, return cached DB status
    console.error(`[KYC] Failed to sync status from Sumsub for user ${userId}:`, err);
  }
}

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
    select: { applicantId: true, softRejections: true, hardRejections: true, reviewComment: true },
  });

  // Auto-sync: if applicant exists but our DB status hasn't moved past UNVERIFIED/PENDING,
  // check Sumsub directly to catch any missed webhooks
  if (
    kycApplication?.applicantId &&
    (user.kycStatus === "UNVERIFIED" || user.kycStatus === "PENDING")
  ) {
    await syncFromSumsub(userId, kycApplication.applicantId);
    // Re-fetch updated values after sync
    const updated = await prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } });
    const updatedApp = await prisma.kycApplication.findUnique({ where: { userId }, select: { applicantId: true, softRejections: true, hardRejections: true, reviewComment: true } });
    if (updated) {
      return {
        kycStatus: updated.kycStatus,
        applicantId: updatedApp?.applicantId || null,
        softRejections: updatedApp?.softRejections ?? 0,
        hardRejections: updatedApp?.hardRejections ?? 0,
        reviewComment: updatedApp?.reviewComment || null,
        canRetry: updated.kycStatus === "REJECTED" && (updatedApp?.softRejections ?? 0) < 5 && (updatedApp?.hardRejections ?? 0) < 2,
      };
    }
  }

  return {
    kycStatus: user.kycStatus,
    applicantId: kycApplication?.applicantId || null,
    softRejections: kycApplication?.softRejections ?? 0,
    hardRejections: kycApplication?.hardRejections ?? 0,
    reviewComment: kycApplication?.reviewComment || null,
    canRetry:
      user.kycStatus === "REJECTED" &&
      (kycApplication?.softRejections ?? 0) < 5 &&
      (kycApplication?.hardRejections ?? 0) < 2,
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

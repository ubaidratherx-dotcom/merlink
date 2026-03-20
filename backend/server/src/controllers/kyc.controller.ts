import { Request, Response, NextFunction } from "express";
import { kycService } from "../services/kyc.service";
import { prisma } from "../lib/prisma";

export async function startKyc(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;

    // Get user info for the applicant
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, kycStatus: true },
    });

    if (!user) {
      res
        .status(404)
        .json({ error: { message: "User not found", code: "NOT_FOUND" } });
      return;
    }

    // If already verified, no need to start again
    if (user.kycStatus === "VERIFIED") {
      res
        .status(400)
        .json({ error: { message: "KYC already verified", code: "BAD_REQUEST" } });
      return;
    }

    // Create applicant on Sumsub
    await kycService.createApplicant(userId, {
      email: user.email || undefined,
      phone: user.phone || undefined,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    });

    // Get SDK access token
    const token = await kycService.getAccessToken(userId);

    res.json({
      success: true,
      data: { accessToken: token },
    });
  } catch (error) {
    next(error);
  }
}

export async function getKycStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const status = await kycService.getApplicantStatus(userId);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
}

export async function kycWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature =
      (req.headers["x-payload-digest"] as string) ||
      (req.headers["x-sumsub-signature"] as string) ||
      "";

    if (!signature) {
      res
        .status(400)
        .json({ error: { message: "Missing webhook signature", code: "BAD_REQUEST" } });
      return;
    }

    // req.body is a raw Buffer from express.raw() middleware
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString("utf8")) : req.body;

    await kycService.handleWebhook(payload, signature, rawBody);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

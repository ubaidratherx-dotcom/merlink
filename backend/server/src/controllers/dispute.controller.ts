import { Request, Response, NextFunction } from "express";
import { disputeService } from "../services/dispute.service";

export async function getDispute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const data = await disputeService.getDispute(req.params.tradeId, userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadEvidence(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const evidence = await disputeService.uploadEvidence(req.params.disputeId, userId, req.body);
    res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    next(error);
  }
}

// Admin endpoints
export async function getOpenDisputes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const disputes = await disputeService.getOpenDisputes();
    res.json({ success: true, data: disputes });
  } catch (error) {
    next(error);
  }
}

export async function resolveDispute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.userId;
    const { resolution, note } = req.body;
    if (!resolution || !["RELEASE_TO_BUYER", "REFUND_TO_SELLER"].includes(resolution)) {
      res.status(400).json({ error: { message: "resolution must be RELEASE_TO_BUYER or REFUND_TO_SELLER", code: "INVALID_RESOLUTION" } });
      return;
    }
    const dispute = await disputeService.resolveDispute(req.params.disputeId, adminId, resolution, note);
    res.json({ success: true, data: dispute });
  } catch (error) {
    next(error);
  }
}

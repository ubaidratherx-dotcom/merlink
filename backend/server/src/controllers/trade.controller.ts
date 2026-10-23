import { Request, Response, NextFunction } from "express";
import { tradeService } from "../services/trade.service";

export async function createTrade(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await tradeService.createTrade(userId, req.body);
    res.status(201).json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function getUserTrades(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { status, page, pageSize } = req.query;
    const result = await tradeService.getUserTrades(userId, {
      status: status as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getTradeById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await tradeService.getTradeById(req.params.id, userId);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function confirmEscrowLocked(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { escrowTxSignature } = req.body;
    if (!escrowTxSignature) {
      res.status(400).json({
        error: { message: "escrowTxSignature is required", code: "MISSING_FIELD" },
      });
      return;
    }
    const trade = await tradeService.confirmEscrowLocked(
      req.params.id,
      userId,
      escrowTxSignature
    );
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function markPaymentSent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await tradeService.markPaymentSent(req.params.id, userId);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function confirmRelease(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await tradeService.confirmRelease(req.params.id, userId);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function cancelTrade(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await tradeService.cancelTrade(req.params.id, userId);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function openDispute(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({
        error: { message: "reason is required", code: "MISSING_FIELD" },
      });
      return;
    }
    const trade = await tradeService.openDispute(req.params.id, userId, reason);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

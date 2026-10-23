import { Request, Response, NextFunction } from "express";
import { buyRequestService } from "../services/buyRequest.service";

export async function createBuyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const buyRequest = await buyRequestService.createBuyRequest(
      userId,
      req.body
    );
    res.status(201).json({ success: true, data: buyRequest });
  } catch (error) {
    next(error);
  }
}

export async function getBuyRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const excludeBuyerId = req.user?.userId;
    const result = await buyRequestService.getBuyRequests({
      ...req.query,
      excludeBuyerId,
    } as any);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getBuyRequestById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const buyRequest = await buyRequestService.getBuyRequestById(req.params.id);
    res.json({ success: true, data: buyRequest });
  } catch (error) {
    next(error);
  }
}

export async function getMyBuyRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const buyRequests = await buyRequestService.getMyBuyRequests(userId);
    res.json({ success: true, data: buyRequests });
  } catch (error) {
    next(error);
  }
}

export async function cancelBuyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const buyRequest = await buyRequestService.cancelBuyRequest(
      req.params.id,
      userId
    );
    res.json({ success: true, data: buyRequest });
  } catch (error) {
    next(error);
  }
}

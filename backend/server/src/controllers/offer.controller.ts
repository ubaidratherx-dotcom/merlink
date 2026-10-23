import { Request, Response, NextFunction } from "express";
import { offerService } from "../services/offer.service";

export async function createOffer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const offer = await offerService.createOffer(userId, req.body);
    res.status(201).json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
}

export async function getOffersForBuyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const offers = await offerService.getOffersForBuyRequest(req.params.buyRequestId, userId);
    res.json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
}

export async function acceptOffer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const trade = await offerService.acceptOffer(req.params.offerId, userId);
    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
}

export async function declineOffer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const offer = await offerService.declineOffer(req.params.offerId, userId);
    res.json({ success: true, data: offer });
  } catch (error) {
    next(error);
  }
}

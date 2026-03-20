import { Request, Response, NextFunction } from "express";
import { listingService } from "../services/listing.service";

export async function enableSellerMode(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await listingService.enableSellerMode(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function createListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await listingService.createListing(userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { listingId } = req.params;
    const result = await listingService.updateListing(userId, listingId, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { listingId } = req.params;
    await listingService.deleteListing(userId, listingId);
    res.json({ success: true, message: "Listing deleted" });
  } catch (error) {
    next(error);
  }
}

export async function getListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { listingId } = req.params;
    const result = await listingService.getListingById(listingId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getListings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await listingService.getListings(req.query as any);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMyListings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await listingService.getMyListings(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function refreshLiquidity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { listingId } = req.params;
    const result = await listingService.refreshLiquidity(listingId, userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service";

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await userService.getUserById(userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { username, profilePhoto, latitude, longitude } = req.body;
    const user = await userService.updateProfile(userId, {
      username,
      profilePhoto,
      latitude,
      longitude,
    });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function getPublicProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const profile = await userService.getPublicProfile(userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

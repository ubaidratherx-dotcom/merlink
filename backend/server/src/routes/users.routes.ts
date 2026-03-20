import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getProfile,
  updateProfile,
  getPublicProfile,
} from "../controllers/user.controller";

const router = Router();

router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);
router.get("/:userId", getPublicProfile);

export default router;

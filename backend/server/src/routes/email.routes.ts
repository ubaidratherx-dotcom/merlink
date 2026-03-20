import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { sendVerification, verifyEmail } from "../controllers/email.controller";

const router = Router();

router.post("/send-verification", authenticate, sendVerification);
router.get("/verify", verifyEmail);

export default router;

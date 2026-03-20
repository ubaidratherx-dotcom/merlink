import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createApplicantSchema, webhookSchema } from "../validators/kyc.validator";
import { startKyc, getKycStatus, kycWebhook } from "../controllers/kyc.controller";

const router = Router();

router.post("/start", authenticate, validate({ body: createApplicantSchema }), startKyc);
router.get("/status", authenticate, getKycStatus);
router.post("/webhook", validate({ body: webhookSchema }), kycWebhook);

export default router;

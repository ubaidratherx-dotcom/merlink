import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createApplicantSchema } from "../validators/kyc.validator";
import { startKyc, getKycStatus, kycWebhook } from "../controllers/kyc.controller";

const router = Router();

router.post("/start", authenticate, validate({ body: createApplicantSchema }), startKyc);
router.get("/status", authenticate, getKycStatus);
// Webhook body is a raw Buffer (express.raw applied in index.ts) — validation done inside controller
router.post("/webhook", kycWebhook);

export default router;

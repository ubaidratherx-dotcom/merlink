import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { verifyWalletSchema, disconnectWalletSchema } from "../validators/wallet.validator";
import {
  verifyWallet,
  disconnectWallet,
  getBalance,
} from "../controllers/wallet.controller";

const router = Router();

router.post("/verify", authenticate, validate({ body: verifyWalletSchema }), verifyWallet);
router.post("/disconnect", authenticate, validate({ body: disconnectWalletSchema }), disconnectWallet);
router.get("/balance", authenticate, getBalance);

export default router;

import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
} from "../validators/auth.validator";
import {
  register,
  loginEmail,
  loginPhone,
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  me,
} from "../controllers/auth.controller";
import {
  requestReset,
  resetPassword,
} from "../controllers/password.controller";

const router = Router();

router.post("/register", authLimiter, validate({ body: registerSchema }), register);
router.post("/login/email", authLimiter, validate({ body: loginSchema }), loginEmail);
router.post("/login/phone", authLimiter, validate({ body: loginSchema }), loginPhone);
router.post("/otp/send", otpLimiter, validate({ body: sendOtpSchema }), sendOtp);
router.post("/otp/verify", authLimiter, validate({ body: verifyOtpSchema }), verifyOtp);
router.post("/refresh", validate({ body: refreshTokenSchema }), refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);

// Password reset
router.post("/forgot-password", authLimiter, requestReset);
router.post("/reset-password", resetPassword);

export default router;

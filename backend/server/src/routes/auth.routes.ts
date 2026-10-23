import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";

const isDev = process.env.NODE_ENV === "development";
const devPass = (_req: any, _res: any, next: any) => next();
const authLimit = isDev ? devPass : authLimiter;
const otpLimit = isDev ? devPass : otpLimiter;
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

router.post("/register", authLimit, validate({ body: registerSchema }), register);
router.post("/login/email", authLimit, validate({ body: loginSchema }), loginEmail);
router.post("/login/phone", authLimit, validate({ body: loginSchema }), loginPhone);
router.post("/otp/send", otpLimit, validate({ body: sendOtpSchema }), sendOtp);
router.post("/otp/verify", authLimit, validate({ body: verifyOtpSchema }), verifyOtp);
router.post("/refresh", validate({ body: refreshTokenSchema }), refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);

// Password reset
router.post("/forgot-password", authLimit, requestReset);
router.post("/reset-password", resetPassword);

// Change password (authenticated)
router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const bcryptMod = await import("bcryptjs");
    const bcrypt = (bcryptMod as any).default ?? bcryptMod;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: "currentPassword and newPassword required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user?.passwordHash) {
      return res.status(400).json({ success: false, error: "No password set — use social login" });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ success: false, error: "Current password is incorrect" });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    res.json({ success: true, message: "Password changed" });
  } catch (error) { next(error); }
});

// Active sessions
router.get("/sessions", authenticate, async (req, res, next) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user!.userId, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: sessions });
  } catch (error) { next(error); }
});

// Revoke a session
router.delete("/sessions/:sessionId", authenticate, async (req, res, next) => {
  try {
    const { prisma } = await import("../lib/prisma");
    const session = await prisma.refreshToken.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.userId !== req.user!.userId) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    await prisma.refreshToken.delete({ where: { id: req.params.sessionId } });
    res.json({ success: true, message: "Session revoked" });
  } catch (error) { next(error); }
});

// ─── 2FA ────────────────────────────────────────────────

// Generate 2FA secret + QR code
router.post("/2fa/setup", authenticate, async (req, res, next) => {
  try {
    const { twoFactorService } = await import("../services/twoFactor.service");
    const result = await twoFactorService.generateSecret(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// Verify code and enable 2FA
router.post("/2fa/verify", authenticate, async (req, res, next) => {
  try {
    const { twoFactorService } = await import("../services/twoFactor.service");
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: "code required" });
    await twoFactorService.verifyAndEnable(req.user!.userId, code);
    res.json({ success: true, message: "2FA enabled" });
  } catch (error) { next(error); }
});

// Disable 2FA
router.post("/2fa/disable", authenticate, async (req, res, next) => {
  try {
    const { twoFactorService } = await import("../services/twoFactor.service");
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: "code required" });
    await twoFactorService.disable(req.user!.userId, code);
    res.json({ success: true, message: "2FA disabled" });
  } catch (error) { next(error); }
});

// Verify 2FA during login (called after password check)
router.post("/2fa/login-verify", async (req, res, next) => {
  try {
    const { twoFactorService } = await import("../services/twoFactor.service");
    const { prisma } = await import("../lib/prisma");
    const { authService } = await import("../services/auth.service");
    const generateTokens = authService.generateTokens;
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ success: false, error: "userId and code required" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) return res.status(400).json({ success: false, error: "2FA not set up" });

    const valid = twoFactorService.verifyCode(user.twoFactorSecret, code);
    if (!valid) return res.status(400).json({ success: false, error: "Invalid 2FA code" });

    const tokens = await generateTokens(user.id, user.username);
    res.json({ success: true, data: { user: { id: user.id, username: user.username, email: user.email }, ...tokens } });
  } catch (error) { next(error); }
});

export default router;

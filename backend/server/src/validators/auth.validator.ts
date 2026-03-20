import { z } from "zod";

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be at most 20 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, underscores, and hyphens"
      ),
    phone: z.string().min(1).optional(),
    email: z.string().email("Invalid email address").optional(),
    password: z.string().optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: "Must provide either phone or email",
    path: ["phone"],
  })
  .refine(
    (data) => {
      if (data.email && !data.password) return false;
      return true;
    },
    {
      message: "Password is required when registering with email",
      path: ["password"],
    }
  )
  .refine(
    (data) => {
      if (data.password) {
        if (data.password.length < 8) return false;
        if (!/[A-Z]/.test(data.password)) return false;
        if (!/[a-z]/.test(data.password)) return false;
        if (!/[0-9]/.test(data.password)) return false;
      }
      return true;
    },
    {
      message:
        "Password must be at least 8 characters with uppercase, lowercase, and a number",
      path: ["password"],
    }
  );

export const loginSchema = z
  .object({
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().optional(),
  })
  .refine((data) => data.phone || (data.email && data.password), {
    message: "Must provide phone or email with password",
    path: ["email"],
  });

export const sendOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  code: z
    .string()
    .length(6, "OTP code must be 6 digits")
    .regex(/^\d{6}$/, "OTP code must be 6 digits"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

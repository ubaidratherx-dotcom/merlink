"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import styles from "./page.module.css";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const visible = phone.slice(-4);
  const masked = phone.slice(0, -4).replace(/\d/g, "*");
  return masked + visible;
}

export default function VerifyOtpPage() {
  const router = useRouter();
  const { phone, setUser, setTokens } = useAuthStore();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no phone number stored
  useEffect(() => {
    if (!phone) {
      router.replace("/login");
    }
  }, [phone, router]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const submitOtp = useCallback(
    async (code: string) => {
      if (!phone || isLoading) return;

      setIsLoading(true);
      setApiError("");

      try {
        const result = await api.auth.verifyOtp(phone, code);
        const { user, ...tokens } = result as any;
        setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        setUser(user);
        router.push("/");
      } catch (err) {
        setApiError(
          err instanceof Error ? err.message : "Invalid code. Please try again.",
        );
        // Clear digits on error
        setDigits(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [phone, isLoading, setTokens, setUser, router],
  );

  function handleChange(index: number, value: string) {
    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === OTP_LENGTH - 1) {
      const code = newDigits.join("");
      if (code.length === OTP_LENGTH) {
        submitOtp(code);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    // Focus last filled or next empty
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();

    if (pasted.length === OTP_LENGTH) {
      submitOtp(pasted);
    }
  }

  async function handleResend() {
    if (!phone || countdown > 0) return;

    try {
      await api.auth.sendOtp(phone);
      setCountdown(RESEND_COOLDOWN);
      setApiError("");
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to resend code",
      );
    }
  }

  function handleManualSubmit() {
    const code = digits.join("");
    if (code.length === OTP_LENGTH) {
      submitOtp(code);
    }
  }

  if (!phone) return null;

  return (
    <>
      <h2 className={styles.heading}>Verify your phone number</h2>
      <p className={styles.subtitle}>
        We sent a 6-digit code to{" "}
        <span className={styles.phoneHighlight}>{maskPhone(phone)}</span>
      </p>

      {apiError && <div className={styles.errorBanner}>{apiError}</div>}

      <div className={styles.otpContainer} onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className={styles.otpInput}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            disabled={isLoading}
          />
        ))}
      </div>

      <button
        type="button"
        className={styles.verifyButton}
        onClick={handleManualSubmit}
        disabled={isLoading || digits.join("").length < OTP_LENGTH}
      >
        {isLoading && <span className={styles.spinner} />}
        Verify
      </button>

      <div className={styles.resend}>
        {countdown > 0 ? (
          <span className={styles.countdown}>
            Resend code in {countdown}s
          </span>
        ) : (
          <button
            type="button"
            className={styles.resendButton}
            onClick={handleResend}
          >
            Resend code
          </button>
        )}
      </div>
    </>
  );
}

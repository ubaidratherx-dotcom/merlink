"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import styles from "./page.module.css";

type Status = "form" | "success" | "error";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [status, setStatus] = useState<Status>(token ? "form" : "error");

  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /\d/.test(password) },
  ];

  function validate(): boolean {
    const errors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(password)) {
      errors.password = "Password must contain an uppercase letter";
    } else if (!/[a-z]/.test(password)) {
      errors.password = "Password must contain a lowercase letter";
    } else if (!/\d/.test(password)) {
      errors.password = "Password must contain a number";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError("");

    if (!validate()) return;
    if (!token) return;

    setIsLoading(true);

    try {
      await api.auth.resetPassword(token, password);
      setStatus("success");
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Invalid or expired reset link"
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (status === "error" && !token) {
    return (
      <div className={styles.successContainer}>
        <div className={`${styles.iconWrapper} ${styles.iconError}`}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FF453A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h2 className={styles.successHeading}>Invalid Link</h2>
        <p className={styles.successMessage}>
          Invalid or expired reset link.
        </p>
        <Link href="/forgot-password" className={styles.signInLink}>
          Request New Link
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={styles.successContainer}>
        <div className={`${styles.iconWrapper} ${styles.iconSuccess}`}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16C784"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className={styles.successHeading}>Password Reset</h2>
        <p className={styles.successMessage}>
          Password reset! You can now sign in.
        </p>
        <Link href="/login" className={styles.signInLink}>
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className={styles.heading}>Reset Password</h2>
      <p className={styles.subtitle}>Choose a new password for your account.</p>

      {apiError && (
        <ErrorBanner message={apiError} onDismiss={() => setApiError("")} />
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.fieldGroup}>
          <label htmlFor="password" className={styles.label}>
            New Password
          </label>
          <input
            id="password"
            type="password"
            className={styles.input}
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <span className={styles.fieldError}>{fieldErrors.password}</span>
          )}
          {password.length > 0 && (
            <div className={styles.rules}>
              {rules.map((rule) => (
                <span
                  key={rule.label}
                  className={`${styles.rule} ${rule.met ? styles.ruleMet : ""}`}
                >
                  {rule.met ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
                  )}
                  {rule.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="confirm-password" className={styles.label}>
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            className={styles.input}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword && (
            <span className={styles.fieldError}>
              {fieldErrors.confirmPassword}
            </span>
          )}
        </div>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading && <span className={styles.spinner} />}
          Reset Password
        </button>
      </form>

      <p className={styles.footer}>
        <Link href="/login">Back to Sign In</Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "var(--space-3xl)" }}>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import styles from "./page.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [success, setSuccess] = useState(false);

  function validate(): boolean {
    if (!email.trim()) {
      setFieldError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("Enter a valid email address");
      return false;
    }
    setFieldError("");
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      await api.auth.forgotPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.iconWrapper}>
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
        <h2 className={styles.successHeading}>Check Your Email</h2>
        <p className={styles.successMessage}>
          Check your email for a password reset link.
        </p>
        <p className={styles.footer}>
          <Link href="/login">Back to Sign In</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className={styles.heading}>Forgot Password</h2>
      <p className={styles.subtitle}>
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {apiError && (
        <ErrorBanner message={apiError} onDismiss={() => setApiError("")} />
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.fieldGroup}>
          <label htmlFor="email" className={styles.label}>
            Email
          </label>
          <input
            id="email"
            type="email"
            className={styles.input}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldError && (
            <span className={styles.fieldError}>{fieldError}</span>
          )}
        </div>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading && <span className={styles.spinner} />}
          Send Reset Link
        </button>
      </form>

      <p className={styles.footer}>
        <Link href="/login">Back to Sign In</Link>
      </p>
    </>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import ErrorBanner from "@/components/ErrorBanner";
import styles from "./page.module.css";

type Tab = "phone" | "email";

interface FieldErrors {
  phone?: string;
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens, setPhone } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Phone tab
  const [phone, setPhoneValue] = useState("");

  // Email tab
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (activeTab === "phone") {
      if (!phone.trim()) {
        errors.phone = "Phone number is required";
      } else if (!/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ""))) {
        errors.phone = "Enter a valid phone number with country code";
      }
    } else {
      if (!email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Enter a valid email address";
      }
      if (!password) {
        errors.password = "Password is required";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      if (activeTab === "phone") {
        const cleanPhone = phone.replace(/[\s()-]/g, "");
        await api.auth.loginPhone({ phone: cleanPhone });
        setPhone(cleanPhone);
        router.push("/verify-otp");
      } else {
        const result = await api.auth.loginEmail({
          email: email.trim(),
          password,
        });
        const { user, ...tokens } = result as any;
        setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        setUser(user);
        router.push("/");
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <h2 className={styles.heading}>Welcome back</h2>

      <div className={styles.tabToggle}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "phone" ? styles.tabActive : ""}`}
          onClick={() => {
            setActiveTab("phone");
            setFieldErrors({});
            setApiError("");
          }}
        >
          Phone
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "email" ? styles.tabActive : ""}`}
          onClick={() => {
            setActiveTab("email");
            setFieldErrors({});
            setApiError("");
          }}
        >
          Email
        </button>
      </div>

      {apiError && (
        <ErrorBanner message={apiError} onDismiss={() => setApiError("")} />
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {activeTab === "phone" ? (
          <div className={styles.fieldGroup}>
            <label htmlFor="phone" className={styles.label}>
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              className={styles.input}
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhoneValue(e.target.value)}
              autoComplete="tel"
            />
            {fieldErrors.phone && (
              <span className={styles.fieldError}>{fieldErrors.phone}</span>
            )}
          </div>
        ) : (
          <>
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
              {fieldErrors.email && (
                <span className={styles.fieldError}>{fieldErrors.email}</span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {fieldErrors.password && (
                <span className={styles.fieldError}>
                  {fieldErrors.password}
                </span>
              )}
              <Link
                href="/forgot-password"
                className={styles.forgotLink}
              >
                Forgot password?
              </Link>
            </div>
          </>
        )}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading && <span className={styles.spinner} />}
          {activeTab === "phone" ? "Send Code" : "Sign In"}
        </button>
      </form>

      <p className={styles.footer}>
        Don&apos;t have an account? <Link href="/register">Sign up</Link>
      </p>
    </>
  );
}

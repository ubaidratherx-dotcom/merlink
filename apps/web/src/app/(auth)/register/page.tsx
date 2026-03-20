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
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, setTokens, setPhone } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Phone tab fields
  const [phone, setPhoneValue] = useState("");
  const [phoneUsername, setPhoneUsername] = useState("");

  // Email tab fields
  const [email, setEmail] = useState("");
  const [emailUsername, setEmailUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (activeTab === "phone") {
      if (!phone.trim()) {
        errors.phone = "Phone number is required";
      } else if (!/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ""))) {
        errors.phone = "Enter a valid phone number with country code";
      }
      if (!phoneUsername.trim()) {
        errors.username = "Username is required";
      } else if (phoneUsername.trim().length < 3) {
        errors.username = "Username must be at least 3 characters";
      }
    } else {
      if (!email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Enter a valid email address";
      }
      if (!emailUsername.trim()) {
        errors.username = "Username is required";
      } else if (emailUsername.trim().length < 3) {
        errors.username = "Username must be at least 3 characters";
      }
      if (!password) {
        errors.password = "Password is required";
      } else if (password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
      if (!confirmPassword) {
        errors.confirmPassword = "Please confirm your password";
      } else if (password !== confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
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
        await api.auth.register({
          username: phoneUsername.trim(),
          phone: cleanPhone,
        });

        // Send OTP for verification
        await api.auth.sendOtp(cleanPhone);
        setPhone(cleanPhone);
        router.push("/verify-otp");
      } else {
        const result = await api.auth.register({
          username: emailUsername.trim(),
          email: email.trim(),
          password,
        });

        const { user, ...tokens } = result as any;
        if (tokens.accessToken) {
          setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        }
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
      <h2 className={styles.heading}>Create your account</h2>

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
          <>
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
            <div className={styles.fieldGroup}>
              <label htmlFor="phone-username" className={styles.label}>
                Username
              </label>
              <input
                id="phone-username"
                type="text"
                className={styles.input}
                placeholder="Choose a username"
                value={phoneUsername}
                onChange={(e) => setPhoneUsername(e.target.value)}
                autoComplete="username"
              />
              {fieldErrors.username && (
                <span className={styles.fieldError}>
                  {fieldErrors.username}
                </span>
              )}
            </div>
          </>
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
              <label htmlFor="email-username" className={styles.label}>
                Username
              </label>
              <input
                id="email-username"
                type="text"
                className={styles.input}
                placeholder="Choose a username"
                value={emailUsername}
                onChange={(e) => setEmailUsername(e.target.value)}
                autoComplete="username"
              />
              {fieldErrors.username && (
                <span className={styles.fieldError}>
                  {fieldErrors.username}
                </span>
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
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <span className={styles.fieldError}>
                  {fieldErrors.password}
                </span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="confirm-password" className={styles.label}>
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                className={styles.input}
                placeholder="Confirm your password"
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
          </>
        )}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading && <span className={styles.spinner} />}
          {activeTab === "phone" ? "Continue" : "Create Account"}
        </button>
      </form>

      <p className={styles.footer}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import styles from "./page.module.css";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token provided");
      return;
    }

    api.email
      .verify(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Invalid or expired link"
        );
      });
  }, [token]);

  return (
    <div className={styles.container}>
      {status === "loading" && (
        <>
          <div className={styles.spinner} />
          <p className={styles.statusText}>Verifying your email...</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className={`${styles.iconWrapper} ${styles.iconSuccess}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className={styles.heading}>Email Verified</h2>
          <p className={styles.message}>Email verified! You can now sign in.</p>
          <Link href="/login" className={styles.signInLink}>Sign In</Link>
        </>
      )}

      {status === "error" && (
        <>
          <div className={`${styles.iconWrapper} ${styles.iconError}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h2 className={styles.heading}>Verification Failed</h2>
          <p className={styles.message}>{errorMessage || "Invalid or expired link"}</p>
          <Link href="/login" className={styles.signInLink}>Sign In</Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.container}><div className={styles.spinner} /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

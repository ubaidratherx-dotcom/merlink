"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import styles from "./page.module.css";

type KycStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "PERMANENTLY_REJECTED";

interface KycStatusData {
  kycStatus: KycStatus;
  applicantId: string | null;
  softRejections: number;
  hardRejections: number;
  reviewComment: string | null;
  canRetry: boolean;
}

const SUMSUB_SDK_URL =
  "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";

export default function KycPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [statusData, setStatusData] = useState<KycStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSdk, setShowSdk] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState("");

  const sdkContainerRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Fetch authoritative status from server — never rely on stale auth store
  const fetchStatus = useCallback(async (): Promise<KycStatusData | null> => {
    try {
      const result = await api.kyc.getStatus();
      const data = result as KycStatusData;
      setStatusData(data);

      // Keep auth store in sync
      if (user && data.kycStatus !== user.kycStatus) {
        setUser({ ...user, kycStatus: data.kycStatus });
      }

      return data;
    } catch {
      return null;
    }
  }, [user, setUser]);

  // Initial load
  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling — only while PENDING
  useEffect(() => {
    if (statusData?.kycStatus === "PENDING") {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const data = await fetchStatus();
          if (data && data.kycStatus !== "PENDING") {
            stopPolling();
          }
        }, 5000);
      }
    } else {
      stopPolling();
    }

    return stopPolling;
  }, [statusData?.kycStatus, fetchStatus, stopPolling]);

  function loadSumsubScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${SUMSUB_SDK_URL}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = SUMSUB_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Sumsub SDK"));
      document.head.appendChild(script);
    });
  }

  function launchSdk(accessToken: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const snsWebSdkBuilder = (window as any).snsWebSdk;
    if (!snsWebSdkBuilder || !sdkContainerRef.current) return;

    const sdk = snsWebSdkBuilder
      .init(accessToken, () =>
        api.kyc.startKyc().then((res) => res.accessToken),
      )
      .withConf({ lang: "en", theme: "light" })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .on("idCheck.onApplicantLoaded", () => setSdkReady(true))
      .on("idCheck.onApplicantSubmitted", () => {
        // Sumsub will now send applicantPending webhook → status becomes PENDING
        setShowSdk(false);
        setStatusData((prev) =>
          prev ? { ...prev, kycStatus: "PENDING" } : prev,
        );
      })
      .on("idCheck.onError", (err: any) => {
        console.error("Sumsub SDK error:", err);
        setError("Verification error. Please try again.");
        setShowSdk(false);
      })
      .build();

    sdk.launch(sdkContainerRef.current);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async function handleStartVerification() {
    setError("");
    setActionLoading(true);
    try {
      const result = await api.kyc.startKyc();
      await loadSumsubScript();
      setShowSdk(true);
      setSdkReady(false);
      requestAnimationFrame(() => launchSdk(result.accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start verification");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.sdkLoading}>
            <div className={styles.sdkSpinner} />
          </div>
        </div>
      </main>
    );
  }

  // ── SDK active ───────────────────────────────────────────────────────────────

  if (showSdk) {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <h1 className={styles.headline}>Identity Verification</h1>
            <p className={styles.subtitle}>Follow the steps to verify your identity</p>
          </div>
          {!sdkReady && (
            <div className={styles.sdkLoading}>
              <div className={styles.sdkSpinner} />
              <p className={styles.sdkLoadingText}>Loading verification module...</p>
            </div>
          )}
          <div
            id="sumsub-websdk-container"
            className={styles.sdkContainer}
            ref={sdkContainerRef}
          />
        </div>
      </main>
    );
  }

  const status = statusData?.kycStatus ?? "UNVERIFIED";
  const canRetry = statusData?.canRetry ?? false;
  const reviewComment = statusData?.reviewComment;
  const hardRejections = statusData?.hardRejections ?? 0;

  // ── UNVERIFIED ───────────────────────────────────────────────────────────────

  if (status === "UNVERIFIED") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div className={`${styles.iconCircle} ${styles.iconCircleDefault}`}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className={styles.headline}>Verify your identity</h1>
            <p className={styles.subtitle}>Complete identity verification to start trading on Merlink</p>
          </div>

          <div className={styles.steps}>
            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <circle cx="8" cy="12" r="2" />
                  <path d="M14 10h4" /><path d="M14 14h4" />
                </svg>
              </div>
              <span className={styles.stepNumber}>1</span>
              <h3 className={styles.stepTitle}>Government ID</h3>
              <p className={styles.stepDescription}>Upload a valid government-issued ID</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <span className={styles.stepNumber}>2</span>
              <h3 className={styles.stepTitle}>Selfie</h3>
              <p className={styles.stepDescription}>Take a photo of yourself</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <span className={styles.stepNumber}>3</span>
              <h3 className={styles.stepTitle}>Verification</h3>
              <p className={styles.stepDescription}>Automated identity check</p>
            </div>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStartVerification}
            disabled={actionLoading}
          >
            {actionLoading && <span className={styles.buttonSpinner} />}
            Start Verification
          </button>

          <p className={styles.infoText}>
            <span className={styles.infoIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
            </span>
            Your data is handled securely by our KYC provider
          </p>
        </div>
      </main>
    );
  }

  // ── PENDING ──────────────────────────────────────────────────────────────────

  if (status === "PENDING") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div className={`${styles.iconCircle} ${styles.iconCirclePending}`}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h1 className={styles.headline}>Verification in progress</h1>
          </div>
          <div className={styles.pendingContent}>
            <div className={styles.pendingSpinner} />
            <p className={styles.pendingText}>
              Your identity is being verified. This usually takes a few minutes.
            </p>
            <p className={styles.pendingSubtext}>
              You don&apos;t need to wait here — we&apos;ll update your status automatically.
            </p>
            <span className={`${styles.badge} ${styles.badgePending}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Pending Review
            </span>
            <div className={styles.pendingActions}>
              <button type="button" className={styles.primaryButton} onClick={() => router.push("/discover")}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── VERIFIED ─────────────────────────────────────────────────────────────────

  if (status === "VERIFIED") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div className={`${styles.iconCircle} ${styles.iconCircleVerified}`}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className={styles.headline}>Identity Verified</h1>
          </div>
          <span className={`${styles.badge} ${styles.badgeVerified}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            KYC Verified
          </span>
          <p className={styles.successText}>You&apos;re all set! You can now trade on Merlink.</p>
          <button type="button" className={styles.primaryButton} onClick={() => router.push("/discover")}>
            Start Trading
          </button>
        </div>
      </main>
    );
  }

  // ── REJECTED (can retry) ─────────────────────────────────────────────────────

  if (status === "REJECTED" && canRetry) {
    const retriesLeft = hardRejections > 0
      ? `1 attempt remaining`
      : `${5 - (statusData?.softRejections ?? 0)} attempt${5 - (statusData?.softRejections ?? 0) !== 1 ? "s" : ""} remaining`;

    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div className={`${styles.iconCircle} ${styles.iconCircleRejected}`}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className={styles.headline}>Verification Failed</h1>
          </div>

          {reviewComment && (
            <div className={styles.rejectionReason}>
              <p className={styles.rejectionReasonLabel}>Reason</p>
              <p className={styles.rejectionReasonText}>{reviewComment}</p>
            </div>
          )}

          <p className={styles.rejectedText}>Please try again with clear, valid documents.</p>
          <p className={styles.retriesLeft}>{retriesLeft}</p>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStartVerification}
            disabled={actionLoading}
          >
            {actionLoading && <span className={styles.buttonSpinner} />}
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // ── PERMANENTLY REJECTED ─────────────────────────────────────────────────────

  return (
    <main className={styles.container}>
      <div className={styles.stateWrapper}>
        <div className={styles.header}>
          <div className={`${styles.iconCircle} ${styles.iconCircleRejected}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h1 className={styles.headline}>Verification Unavailable</h1>
        </div>
        <p className={styles.rejectedText}>
          Your identity verification has been permanently rejected after multiple attempts.
        </p>
        <p className={styles.rejectedSubtext}>
          To appeal or get further assistance, please contact our support team.
        </p>
        <a href="mailto:support@merlink.io" className={styles.primaryButton}>
          Contact Support
        </a>
      </div>
    </main>
  );
}

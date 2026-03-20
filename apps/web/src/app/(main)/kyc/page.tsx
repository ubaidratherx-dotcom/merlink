"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import styles from "./page.module.css";

type KycStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

const SUMSUB_SDK_URL =
  "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";

export default function KycPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [status, setStatus] = useState<KycStatus>(
    (user?.kycStatus as KycStatus) || "UNVERIFIED",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showSdk, setShowSdk] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState("");
  const sdkContainerRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const result = await api.kyc.getStatus();
      const newStatus = result.kycStatus as KycStatus;
      setStatus(newStatus);

      if (user && newStatus !== user.kycStatus) {
        setUser({ ...user, kycStatus: newStatus });
      }

      if (newStatus !== "PENDING" && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch {
      // Silently retry on next interval
    }
  }, [user, setUser]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(pollStatus, 5000);
  }, [pollStatus]);

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

  function initSumsubSdk(accessToken: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const snsWebSdkBuilder = (window as any).snsWebSdk;
    if (!snsWebSdkBuilder || !sdkContainerRef.current) return;

    const sdk = snsWebSdkBuilder
      .init(accessToken, () =>
        api.kyc.startKyc().then((res) => res.accessToken),
      )
      .withConf({
        lang: "en",
        theme: "light",
      })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .on("idCheck.onStepCompleted", () => {
        // Step completed — keep going
      })
      .on("idCheck.onApplicantSubmitted", () => {
        setShowSdk(false);
        setStatus("PENDING");
        startPolling();
      })
      .on("idCheck.onApplicantLoaded", () => {
        setSdkReady(true);
      })
      .on("idCheck.onError", (error: any) => {
        console.error("Sumsub SDK error:", error);
        setError("Verification encountered an error. Please try again.");
        setShowSdk(false);
      })
      .build();

    sdk.launch(sdkContainerRef.current);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async function handleStartVerification() {
    setError("");
    setIsLoading(true);

    try {
      const result = await api.kyc.startKyc();
      await loadSumsubScript();
      setShowSdk(true);
      setSdkReady(false);
      // Wait for next render cycle so the container ref is mounted
      requestAnimationFrame(() => {
        initSumsubSdk(result.accessToken);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start verification",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCheckStatus() {
    setIsLoading(true);
    try {
      await pollStatus();
    } finally {
      setIsLoading(false);
    }
  }

  // SDK View
  if (showSdk) {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <h1 className={styles.headline}>Identity Verification</h1>
            <p className={styles.subtitle}>
              Follow the steps below to verify your identity
            </p>
          </div>
          {!sdkReady && (
            <div className={styles.sdkLoading}>
              <div className={styles.sdkSpinner} />
              <p className={styles.sdkLoadingText}>
                Loading verification module...
              </p>
            </div>
          )}
          <div id="sumsub-websdk-container" className={styles.sdkContainer} ref={sdkContainerRef} />
        </div>
      </main>
    );
  }

  // UNVERIFIED State
  if (status === "UNVERIFIED") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div className={`${styles.iconCircle} ${styles.iconCircleDefault}`}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7B5EFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className={styles.headline}>Verify your identity</h1>
            <p className={styles.subtitle}>
              Complete identity verification to start trading on Merlink
            </p>
          </div>

          <div className={styles.steps}>
            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7B5EFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <circle cx="8" cy="12" r="2" />
                  <path d="M14 10h4" />
                  <path d="M14 14h4" />
                </svg>
              </div>
              <span className={styles.stepNumber}>1</span>
              <h3 className={styles.stepTitle}>Government ID</h3>
              <p className={styles.stepDescription}>
                Upload a valid government-issued ID
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7B5EFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <span className={styles.stepNumber}>2</span>
              <h3 className={styles.stepTitle}>Selfie</h3>
              <p className={styles.stepDescription}>
                Take a photo of yourself
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7B5EFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <span className={styles.stepNumber}>3</span>
              <h3 className={styles.stepTitle}>Verification</h3>
              <p className={styles.stepDescription}>
                Automated identity check
              </p>
            </div>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStartVerification}
            disabled={isLoading}
          >
            {isLoading && <span className={styles.buttonSpinner} />}
            Start Verification
          </button>

          <p className={styles.infoText}>
            <span className={styles.infoIcon}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </span>
            Your data is handled securely by our KYC provider
          </p>
        </div>
      </main>
    );
  }

  // PENDING State
  if (status === "PENDING") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div
              className={`${styles.iconCircle} ${styles.iconCirclePending}`}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FF9F0A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
              You don&apos;t need to wait here — feel free to explore the app.
              We&apos;ll update your status automatically.
            </p>
            <span className={`${styles.badge} ${styles.badgePending}`}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Pending Review
            </span>
            <div className={styles.pendingActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => router.push("/")}
              >
                Go to Dashboard
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCheckStatus}
                disabled={isLoading}
              >
                {isLoading ? "Checking..." : "Check Status"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // VERIFIED State
  if (status === "VERIFIED") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div
              className={`${styles.iconCircle} ${styles.iconCircleVerified}`}
            >
              <svg
                width="36"
                height="36"
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
            <h1 className={styles.headline}>Identity Verified</h1>
          </div>

          <span className={`${styles.badge} ${styles.badgeVerified}`}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            KYC Verified
          </span>

          <p className={styles.successText}>
            You&apos;re all set! You can now trade on Merlink.
          </p>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => router.push("/")}
          >
            Start Trading
          </button>
        </div>
      </main>
    );
  }

  // REJECTED State
  if (status === "REJECTED") {
    return (
      <main className={styles.container}>
        <div className={styles.stateWrapper}>
          <div className={styles.header}>
            <div
              className={`${styles.iconCircle} ${styles.iconCircleRejected}`}
            >
              <svg
                width="36"
                height="36"
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
            <h1 className={styles.headline}>Verification Failed</h1>
          </div>

          <p className={styles.rejectedText}>
            Your identity verification was not successful.
          </p>
          <p className={styles.rejectedSubtext}>
            Please try again with clear, valid documents.
          </p>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStartVerification}
            disabled={isLoading}
          >
            {isLoading && <span className={styles.buttonSpinner} />}
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return null;
}

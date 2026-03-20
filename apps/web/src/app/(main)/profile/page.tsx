"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import styles from "./page.module.css";

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [apiError, setApiError] = useState("");

  const kycStatus = user?.kycStatus || "UNVERIFIED";
  const accountStatus = user?.accountStatus || "UNVERIFIED";

  function handleSignOut() {
    logout();
    router.replace("/login");
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setApiError("");

    try {
      const data = await api.upload.profilePhoto(file);
      updateUser({ profilePhoto: data.url || data.profilePhoto });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function getUserInitials(): string {
    if (!user?.username) return "?";
    return user.username
      .split(/[\s_-]+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function formatDate(dateStr?: string | null): string {
    if (!dateStr) return "Recently";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } catch {
      return "Recently";
    }
  }

  const isWalletLinked = !!user?.walletAddress && user?.walletVerified;

  function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  const settingsItems = [
    {
      label: "Wallet",
      href: "/profile/wallet",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
      suffix: isWalletLinked ? (
        <span className={styles.walletConnectedInfo}>
          <span className={styles.walletAddress}>
            {truncateAddress(user!.walletAddress!)}
          </span>
          <span className={styles.greenDot} />
        </span>
      ) : null,
    },
    {
      label: "Edit Profile",
      href: "/profile/edit",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
    },
    {
      label: "Security",
      href: "/profile/security",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      label: "Notifications",
      href: "/profile/notifications",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
  ];

  const chevronIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  return (
    <div className={styles.container}>
      {apiError && (
        <ErrorBanner message={apiError} onDismiss={() => setApiError("")} />
      )}

      {/* Profile Header */}
      <div className={styles.profileHeader}>
        <div className={styles.avatarSection}>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label="Upload profile photo"
          >
            {user?.profilePhoto ? (
              <img
                src={user.profilePhoto}
                alt={user.username || "Profile"}
                className={styles.avatarImage}
              />
            ) : (
              <span className={styles.avatarInitials}>
                {getUserInitials()}
              </span>
            )}
            <div className={styles.avatarOverlay}>
              {uploadingPhoto ? (
                <span className={styles.avatarSpinner} />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handlePhotoUpload}
          />
        </div>

        <div className={styles.usernameRow}>
          <h2 className={styles.username}>{user?.username || "User"}</h2>
          {user?.sellerMode && (
            <span className={`${styles.badge} ${styles.badgeSellerMode}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Seller Mode
            </span>
          )}
        </div>

        <div className={styles.badgesRow}>
          {/* Account status badge */}
          {accountStatus === "PHONE_VERIFIED" ? (
            <span className={`${styles.badge} ${styles.badgeGreen}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Phone Verified
            </span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeAmber}`}>
              Unverified
            </span>
          )}

          {/* KYC badge */}
          {kycStatus === "VERIFIED" ? (
            <span className={`${styles.badge} ${styles.badgeGreen}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              KYC Verified
            </span>
          ) : kycStatus === "PENDING" ? (
            <span className={`${styles.badge} ${styles.badgeAmber}`}>
              KYC Pending
            </span>
          ) : (
            <Link href="/kyc" className={`${styles.badge} ${styles.badgePrompt}`}>
              Verify Identity
            </Link>
          )}
        </div>

        <span className={styles.memberSince}>
          Member since {formatDate((user as unknown as Record<string, unknown>)?.createdAt as string)}
        </span>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>0</span>
          <span className={styles.statLabel}>Total Trades</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>&mdash;</span>
          <span className={styles.statLabel}>Avg Rating</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>0%</span>
          <span className={styles.statLabel}>Dispute Rate</span>
        </div>
      </div>

      {/* Settings */}
      <div className={styles.settingsSection}>
        {settingsItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={styles.settingsItem}
          >
            <span className={styles.settingsIcon}>{item.icon}</span>
            <span className={styles.settingsLabel}>{item.label}</span>
            {"suffix" in item && item.suffix ? item.suffix : null}
            <span className={styles.settingsChevron}>{chevronIcon}</span>
          </Link>
        ))}
      </div>

      {/* Danger Zone */}
      <div className={styles.dangerSection}>
        <button
          type="button"
          className={styles.signOutButton}
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function TradesPage() {
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  return (
    <div className={styles.container}>
      {/* Toggle Tabs */}
      <div className={styles.toggleTabs}>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "active" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "completed" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("completed")}
        >
          Completed
        </button>
      </div>

      {activeTab === "active" ? (
        /* Empty state for active trades */
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No active trades</h2>
          <p className={styles.emptySubtitle}>
            Start trading by browsing the marketplace
          </p>
          <Link href="/" className={styles.emptyButton}>
            Browse Marketplace
          </Link>
        </div>
      ) : (
        /* Skeleton trade cards for completed */
        <div className={styles.skeletonCardList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonContent}>
                <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              </div>
              <div className={styles.skeletonBadge} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import styles from "./page.module.css";

export default function MessagesPage() {
  // For now, show empty state + skeleton previews
  const hasMessages = false;

  if (!hasMessages) {
    return (
      <div className={styles.container}>
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
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No messages yet</h2>
          <p className={styles.emptySubtitle}>
            Start a trade to begin chatting
          </p>
          <Link href="/" className={styles.emptyButton}>
            Browse Marketplace
          </Link>
        </div>

        {/* Skeleton conversation list preview */}
        <div className={styles.skeletonList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonConvo}>
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonContent}>
                <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
              </div>
              <div className={styles.skeletonMeta}>
                <div className={styles.skeletonTime} />
                <div className={styles.skeletonBadge} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div className={styles.container} />;
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  ESCROW_LOCKED: "Escrow Locked",
  PAYMENT_MARKED_SENT: "Payment Sent",
  RELEASE_PENDING: "Releasing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  RESOLVED: "Resolved",
};

const ACTIVE_STATUSES = [
  "CREATED",
  "ESCROW_LOCKED",
  "PAYMENT_PENDING",
  "PAYMENT_MARKED_SENT",
  "RELEASE_PENDING",
  "DISPUTED",
];

const COMPLETED_STATUSES = ["COMPLETED", "CANCELLED", "RESOLVED"];

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
};

export default function TradesPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState("");

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.trades.getMine();
      setTrades(data.trades || []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load trades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const activeTrades = trades.filter((t) =>
    ACTIVE_STATUSES.includes(t.status)
  );
  const completedTrades = trades.filter((t) =>
    COMPLETED_STATUSES.includes(t.status)
  );

  const displayTrades =
    activeTab === "active" ? activeTrades : completedTrades;

  return (
    <div className={styles.container}>
      {/* Toggle Tabs */}
      <div className={styles.toggleTabs}>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "active" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active{activeTrades.length > 0 ? ` (${activeTrades.length})` : ""}
        </button>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "completed" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("completed")}
        >
          Completed{completedTrades.length > 0 ? ` (${completedTrades.length})` : ""}
        </button>
      </div>

      {loading ? (
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
      ) : displayTrades.length === 0 ? (
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
          <h2 className={styles.emptyTitle}>
            {activeTab === "active"
              ? "No active trades"
              : "No completed trades"}
          </h2>
          <p className={styles.emptySubtitle}>
            {activeTab === "active"
              ? "Start trading by browsing the marketplace"
              : "Your completed trades will appear here"}
          </p>
          {activeTab === "active" && (
            <Link href="/" className={styles.emptyButton}>
              Browse Marketplace
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.skeletonCardList}>
          {displayTrades.map((trade) => {
            const isBuyer = user?.id === trade.buyerId;
            const counterparty = isBuyer ? trade.seller : trade.buyer;

            return (
              <Link
                key={trade.id}
                href={`/trade/${trade.id}`}
                className={styles.tradeCard}
              >
                <div className={styles.tradeAvatar}>
                  {counterparty?.username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className={styles.tradeContent}>
                  <div className={styles.tradeName}>
                    {isBuyer ? "Buying" : "Selling"} {trade.amount}{" "}
                    {trade.asset}
                  </div>
                  <div className={styles.tradeMeta}>
                    with {counterparty?.username || "Unknown"} &middot;{" "}
                    {PAYMENT_LABEL[trade.paymentMethod] || trade.paymentMethod}
                  </div>
                </div>
                <div className={styles.tradeStatus}>
                  {STATUS_LABELS[trade.status] || trade.status}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

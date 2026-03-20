"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import styles from "./page.module.css";

interface Listing {
  id: string;
  asset: "USDC" | "SOL";
  priceValue: number;
  priceType: string;
  minAmount: number;
  maxAmount: number;
  paymentMethods: string[];
  tradeType: string;
  availableLiquidity: number;
  isActive: boolean;
  createdAt: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
  "Bank Transfer": "Bank Transfer",
  Cash: "Cash",
  Wise: "Wise",
  Revolut: "Revolut",
  "Mobile Money": "Mobile Money",
  PayPal: "PayPal",
  Other: "Other",
};

const TRADE_TYPE_LABEL: Record<string, string> = {
  IN_PERSON: "In Person",
  REMOTE: "Remote",
  BOTH: "Both",
};

export default function MyListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    try {
      const data = await api.listings.getMine();
      setListings(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.listings.delete(id);
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete listing");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(listing: Listing) {
    setTogglingId(listing.id);
    try {
      await api.listings.update(listing.id, { isActive: !listing.isActive });
      setListings((prev) =>
        prev.map((l) =>
          l.id === listing.id ? { ...l, isActive: !l.isActive } : l
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRefreshLiquidity(id: string) {
    setRefreshingId(id);
    try {
      const updated = await api.listings.refreshLiquidity(id);
      if (updated && typeof updated === "object") {
        setListings((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, ...(updated as Partial<Listing>) } : l
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh liquidity");
    } finally {
      setRefreshingId(null);
    }
  }

  function formatPrice(listing: Listing) {
    if (listing.priceType === "MARKET_PLUS") {
      return `Market +${listing.priceValue}%`;
    }
    if (listing.priceType === "MARKET_MINUS") {
      return `Market -${listing.priceValue}%`;
    }
    return `$${(listing.priceValue ?? 0).toFixed(2)}`;
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>My Listings</h1>
        </div>
        <div className={styles.skeletonList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonLine} style={{ width: "40%" }} />
              <div className={styles.skeletonLine} style={{ width: "60%" }} />
              <div className={styles.skeletonLine} style={{ width: "80%" }} />
              <div className={styles.skeletonPills}>
                <div className={styles.skeletonPill} />
                <div className={styles.skeletonPill} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>My Listings</h1>
        <Link href="/sell" className={styles.createLink}>
          + New Listing
        </Link>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
          <button type="button" onClick={() => setError("")} className={styles.errorDismiss}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {listings.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No listings yet</h2>
          <p className={styles.emptySubtitle}>
            Create your first listing to start selling crypto peer-to-peer
          </p>
          <Link href="/sell" className={styles.emptyButton}>
            Create Your First Listing
          </Link>
        </div>
      ) : (
        <div className={styles.listingsList}>
          {listings.map((listing) => (
            <div
              key={listing.id}
              className={`${styles.listingCard} ${!listing.isActive ? styles.listingCardInactive : ""}`}
            >
              <div className={styles.listingCardTop}>
                <div className={styles.listingBadges}>
                  <span className={`${styles.assetBadge} ${listing.asset === "USDC" ? styles.assetBadgeUsdc : styles.assetBadgeSol}`}>
                    {listing.asset}
                  </span>
                  <span className={`${styles.tradeTypeBadge} ${listing.tradeType === "IN_PERSON" ? styles.tradeTypeInPerson : listing.tradeType === "REMOTE" ? styles.tradeTypeRemote : styles.tradeTypeBoth}`}>
                    {TRADE_TYPE_LABEL[listing.tradeType] || listing.tradeType}
                  </span>
                </div>
                <div className={styles.toggleWrapper}>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${listing.isActive ? styles.toggleSwitchOn : ""}`}
                    onClick={() => handleToggleActive(listing)}
                    disabled={togglingId === listing.id}
                    aria-label={listing.isActive ? "Deactivate listing" : "Activate listing"}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
              </div>

              <div className={styles.listingPrice}>
                {formatPrice(listing)}
              </div>

              <div className={styles.listingRange}>
                ${listing.minAmount.toLocaleString()} - ${listing.maxAmount.toLocaleString()}
              </div>

              <div className={styles.listingPayments}>
                {listing.paymentMethods.map((pm) => (
                  <span key={pm} className={styles.paymentChip}>
                    {PAYMENT_LABEL[pm] || pm}
                  </span>
                ))}
              </div>

              <div className={styles.listingLiquidity}>
                <span className={styles.liquidityLabel}>Liquidity</span>
                <span
                  className={
                    listing.availableLiquidity >= listing.minAmount
                      ? styles.liquidityGreen
                      : styles.liquidityAmber
                  }
                >
                  {listing.availableLiquidity.toFixed(listing.asset === "USDC" ? 2 : 4)}{" "}
                  {listing.asset}
                </span>
              </div>

              <div className={styles.listingActions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => handleRefreshLiquidity(listing.id)}
                  disabled={refreshingId === listing.id}
                >
                  {refreshingId === listing.id ? (
                    <span className={styles.spinnerSmall} />
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      Refresh
                    </>
                  )}
                </button>
                <Link href={`/sell/edit/${listing.id}`} className={styles.actionButton}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </Link>
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                  onClick={() => handleDelete(listing.id)}
                  disabled={deletingId === listing.id}
                >
                  {deletingId === listing.id ? (
                    <span className={styles.spinnerSmall} />
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

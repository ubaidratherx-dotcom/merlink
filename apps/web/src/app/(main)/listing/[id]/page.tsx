"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
};

const TRADE_TYPE_LABEL: Record<string, string> = {
  IN_PERSON: "In Person",
  REMOTE: "Remote",
  BOTH: "Both",
};

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const listingId = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  // Trade form state
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [tradeType, setTradeType] = useState<"IN_PERSON" | "REMOTE">("REMOTE");

  const fetchListing = useCallback(async () => {
    try {
      const [data, prices] = await Promise.all([
        api.listings.getById(listingId) as any,
        api.prices.getAll().catch(() => ({})),
      ]);
      setListing(data);
      setMarketPrices(prices);

      // Set defaults from listing
      if (data.paymentMethods?.length > 0) {
        setPaymentMethod(data.paymentMethods[0]);
      }
      if (data.tradeType === "IN_PERSON") {
        setTradeType("IN_PERSON");
      } else if (data.tradeType === "REMOTE") {
        setTradeType("REMOTE");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load listing");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const parsedAmount = parseFloat(amount);
  function fmtAmount(n: number): string {
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toFixed(6);
  }
  const maxAvailable = listing ? Math.min(listing.maxAmount, listing.availableLiquidity ?? listing.maxAmount) : 0;
  const effectiveMin = listing ? (
    listing.availableLiquidity !== null && listing.availableLiquidity < listing.minAmount
      ? Math.floor(listing.availableLiquidity * 0.95 * 1e8) / 1e8  // 5% below wallet balance
      : listing.minAmount
  ) : 0;
  // Use small epsilon for floating point comparison
  const isValidAmount =
    !isNaN(parsedAmount) &&
    parsedAmount > 0 &&
    listing &&
    parsedAmount >= effectiveMin - 0.000001 &&
    parsedAmount <= maxAvailable + 0.000001;
  const exceedsLiquidity = listing && parsedAmount > 0 && listing.availableLiquidity !== null && parsedAmount > listing.availableLiquidity;

  const isMarketPrice = listing?.priceType === "MARKET_PLUS" || listing?.priceType === "MARKET_MINUS";

  // Calculate real USD price
  const marketRate = listing ? (marketPrices[listing.asset] || 0) : 0;
  const calculatedPrice = listing
    ? isMarketPrice
      ? listing.priceType === "MARKET_PLUS"
        ? marketRate * (1 + (listing.priceValue || 0) / 100)
        : marketRate * (1 - (listing.priceValue || 0) / 100)
      : (listing.priceValue || listing.price || 0)
    : 0;
  const totalFiat = isValidAmount ? parsedAmount * calculatedPrice : 0;
  const canSubmit = isValidAmount && paymentMethod && !submitting;

  async function handleStartTrade() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const trade = await api.trades.create({
        listingId,
        amount: parsedAmount,
        paymentMethod,
        tradeType,
      });
      router.push(`/trade/${(trade as any).id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create trade");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading listing...</div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p className={styles.errorText}>{error || "Listing not found"}</p>
          <button className={styles.goBackBtn} onClick={() => router.back()}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const price = listing?.priceValue ?? listing?.price ?? 0;
  const priceDisplayAmount = isMarketPrice ? calculatedPrice : price;
  const isOwnListing = user?.id === listing.sellerId;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => router.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className={styles.headerTitle}>Listing Details</div>
      </div>

      {/* Seller info */}
      <div className={styles.card}>
        <div className={styles.sellerProfile}>
          <div className={styles.avatar}>
            {listing.seller?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div className={styles.sellerInfo}>
            <div className={styles.sellerName}>{listing.seller?.username || "Unknown"}</div>
            <div className={styles.sellerStats}>
              <span className={styles.sellerStat}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className={styles.sellerStatValue}>
                  {listing.seller?.rating?.toFixed(1) || "0.0"}
                </span>
              </span>
              <span className={styles.sellerStat}>
                <span className={styles.sellerStatValue}>{listing.seller?.totalTrades || 0}</span> trades
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Price */}
      <div className={styles.card}>
        <div className={styles.priceHero}>
          <div className={styles.priceLabel}>Price per {listing.asset}</div>
          <div className={styles.priceValue}>
            ${priceDisplayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {isMarketPrice && (
              <span style={{ fontSize: 14, fontWeight: 600, color: listing.priceType === "MARKET_PLUS" ? "#16C784" : "#FF453A", marginLeft: 6 }}>
                {listing.priceType === "MARKET_PLUS" ? `+${price}%` : `-${price}%`}
              </span>
            )}
          </div>
          <div className={styles.assetBadge}>
            {listing.asset}
          </div>
        </div>
      </div>

      {/* Listing details */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Details</div>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Min Amount</span>
            <span className={styles.infoValue}>{effectiveMin} {listing.asset}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Max Amount</span>
            <span className={styles.infoValue}>{listing.maxAmount} {listing.asset}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Trade Type</span>
            <span className={styles.infoValue}>{TRADE_TYPE_LABEL[listing.tradeType] || listing.tradeType}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Liquidity</span>
            <span className={styles.infoValue}>
              {listing.availableLiquidity != null
                ? `${listing.availableLiquidity.toFixed(listing.asset === "USDC" ? 2 : 4)} ${listing.asset}`
                : "N/A"}
            </span>
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginTop: "var(--space-lg)" }}>
          <span className={styles.infoLabel}>Payment Methods</span>
          <div className={styles.paymentChips}>
            {listing.paymentMethods?.map((pm: string) => (
              <span key={pm} className={styles.paymentChip}>
                {PAYMENT_LABEL[pm] || pm}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Trade form — only show for buyers */}
      {!isOwnListing && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Start a Trade</div>

            {submitError && (
              <div className={styles.errorBanner}>{submitError}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", marginTop: "var(--space-sm)" }}>
              {/* Amount */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Amount ({listing.asset})</label>
                <input
                  className={styles.formInput}
                  type="number"
                  step="any"
                  placeholder={`${fmtAmount(effectiveMin)} - ${fmtAmount(maxAvailable)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={effectiveMin}
                  max={maxAvailable}
                />
                <span className={styles.formHint}>
                  Min: {fmtAmount(effectiveMin)} {listing.asset} &middot; Max: {fmtAmount(maxAvailable)} {listing.asset}
                  {listing.availableLiquidity !== null && listing.availableLiquidity < listing.maxAmount && (
                    <> &middot; <span style={{ color: "var(--warning-amber)" }}>Available: {fmtAmount(listing.availableLiquidity)} {listing.asset}</span></>
                  )}
                </span>
                {exceedsLiquidity && (
                  <span style={{ color: "#FF453A", fontSize: 12, fontWeight: 500, marginTop: 4, display: "block" }}>
                    Seller only has {fmtAmount(listing.availableLiquidity!)} {listing.asset} available
                  </span>
                )}
              </div>

              {/* Payment method */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Payment Method</label>
                <select
                  className={styles.formSelect}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {listing.paymentMethods?.map((pm: string) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_LABEL[pm] || pm}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trade type */}
              {listing.tradeType === "BOTH" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Trade Type</label>
                  <div className={styles.tradeTypeToggle}>
                    <button
                      type="button"
                      className={`${styles.tradeTypeOption} ${tradeType === "REMOTE" ? styles.tradeTypeOptionActive : ""}`}
                      onClick={() => setTradeType("REMOTE")}
                    >
                      Remote
                    </button>
                    <button
                      type="button"
                      className={`${styles.tradeTypeOption} ${tradeType === "IN_PERSON" ? styles.tradeTypeOptionActive : ""}`}
                      onClick={() => setTradeType("IN_PERSON")}
                    >
                      In Person
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className={styles.bottomCta}>
            {isValidAmount && (
              <div className={styles.totalLine}>
                <span>You pay (fiat)</span>
                <span className={styles.totalValue}>
                  ${totalFiat.toFixed(2)}
                </span>
              </div>
            )}
            <button
              className={styles.startTradeBtn}
              disabled={!canSubmit}
              onClick={handleStartTrade}
            >
              {submitting ? "Creating Trade..." : `Buy ${amount || "0"} ${listing.asset}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

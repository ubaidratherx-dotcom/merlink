"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const PAYMENT_METHODS = [
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "Cash", value: "CASH" },
  { label: "Wise", value: "WISE" },
  { label: "Revolut", value: "REVOLUT" },
  { label: "Mobile Money", value: "MOBILE_MONEY" },
  { label: "PayPal", value: "PAYPAL" },
  { label: "Other", value: "OTHER" },
];

type PriceType = "fixed" | "market_plus" | "market_minus";

export default function SellPage() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const kycStatus = user?.kycStatus || "UNVERIFIED";
  const hasWallet = !!(user?.walletAddress && user?.walletVerified);
  const sellerMode = !!user?.sellerMode;

  const [asset, setAsset] = useState<"USDC" | "SOL">("USDC");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [priceValue, setPriceValue] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [tradeType, setTradeType] = useState<"IN_PERSON" | "REMOTE" | "BOTH">("BOTH");
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);

  const [balance, setBalance] = useState<{ sol: number; usdc: number } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [enablingSellerMode, setEnablingSellerMode] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!hasWallet) return;
    setBalanceLoading(true);
    try {
      const data = await api.wallet.getBalance();
      setBalance(data);
    } catch {
      // silently fail
    } finally {
      setBalanceLoading(false);
    }
  }, [hasWallet]);

  useEffect(() => {
    if (hasWallet && sellerMode) {
      fetchBalance();
    }
  }, [hasWallet, sellerMode, fetchBalance]);

  function togglePayment(value: string) {
    setSelectedPayments((prev) =>
      prev.includes(value)
        ? prev.filter((m) => m !== value)
        : [...prev, value]
    );
  }

  async function handleEnableSellerMode() {
    setEnablingSellerMode(true);
    setError("");
    try {
      const updatedUser = await api.listings.enableSellerMode();
      updateUser(updatedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable seller mode");
    } finally {
      setEnablingSellerMode(false);
    }
  }

  const parsedPrice = parseFloat(priceValue) || 0;
  const parsedMin = parseFloat(minAmount) || 0;
  const parsedMax = parseFloat(maxAmount) || 0;

  const isFormValid =
    parsedPrice > 0 &&
    parsedMin > 0 &&
    parsedMax > parsedMin &&
    selectedPayments.length > 0;

  const currentBalance = balance
    ? asset === "USDC"
      ? balance.usdc
      : balance.sol
    : null;

  const showLowLiquidity =
    currentBalance !== null && parsedMin > 0 && currentBalance < parsedMin;

  async function handleSubmit() {
    if (!isFormValid) return;
    setSubmitting(true);
    setError("");

    try {
      await api.listings.create({
        asset,
        priceType: priceType === "fixed" ? "FIXED" : priceType === "market_plus" ? "MARKET_PLUS" : "MARKET_MINUS",
        priceValue: parsedPrice,
        minAmount: parsedMin,
        maxAmount: parsedMax,
        paymentMethods: selectedPayments,
        tradeType,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/sell/my-listings");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setSubmitting(false);
    }
  }

  /* Gate 1: KYC not verified */
  if (kycStatus !== "VERIFIED") {
    return (
      <div className={styles.container}>
        <div className={styles.gateCard}>
          <div className={styles.gateIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Complete identity verification</h2>
          <p className={styles.gateSubtitle}>
            Identity verification is required before you can sell crypto on Merlink
          </p>
          <Link href="/kyc" className={styles.gateButton}>
            Start Verification
          </Link>
        </div>
      </div>
    );
  }

  /* Gate 2: No wallet connected */
  if (!hasWallet) {
    return (
      <div className={styles.container}>
        <div className={styles.gateCard}>
          <div className={styles.gateIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Connect your wallet</h2>
          <p className={styles.gateSubtitle}>
            Link and verify a Solana wallet to hold your listing liquidity
          </p>
          <Link href="/profile/wallet" className={styles.gateButton}>
            Connect Wallet
          </Link>
        </div>
      </div>
    );
  }

  /* Gate 3: Seller mode not enabled */
  if (!sellerMode) {
    return (
      <div className={styles.container}>
        <div className={styles.gateCard}>
          <div className={styles.gateIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Enable Seller Mode</h2>
          <p className={styles.gateSubtitle}>
            Activate seller mode to create listings and start selling crypto peer-to-peer
          </p>
          {error && <p className={styles.errorText}>{error}</p>}
          <button
            type="button"
            className={styles.gateButton}
            onClick={handleEnableSellerMode}
            disabled={enablingSellerMode}
          >
            {enablingSellerMode ? (
              <span className={styles.spinnerInline} />
            ) : (
              "Enable Seller Mode"
            )}
          </button>
        </div>
      </div>
    );
  }

  /* All gates passed -- show form */
  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.gateCard}>
          <div className={styles.successIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Listing Created!</h2>
          <p className={styles.gateSubtitle}>
            Your listing is now live. Redirecting to your listings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Create Listing</h1>
        <Link href="/sell/my-listings" className={styles.myListingsLink}>
          My Listings
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

      <div className={styles.formSection}>
        {/* Asset Selector */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Asset</label>
          <div className={styles.pillToggle}>
            <button
              type="button"
              className={`${styles.pill} ${asset === "USDC" ? styles.pillActive : ""}`}
              onClick={() => setAsset("USDC")}
            >
              USDC
            </button>
            <button
              type="button"
              className={`${styles.pill} ${asset === "SOL" ? styles.pillActive : ""}`}
              onClick={() => setAsset("SOL")}
            >
              SOL
            </button>
          </div>
        </div>

        {/* Price Type */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Price Type</label>
          <div className={styles.segmentedControl}>
            <button
              type="button"
              className={`${styles.segment} ${priceType === "fixed" ? styles.segmentActive : ""}`}
              onClick={() => setPriceType("fixed")}
            >
              Fixed Price
            </button>
            <button
              type="button"
              className={`${styles.segment} ${priceType === "market_plus" ? styles.segmentActive : ""}`}
              onClick={() => setPriceType("market_plus")}
            >
              Market +
            </button>
            <button
              type="button"
              className={`${styles.segment} ${priceType === "market_minus" ? styles.segmentActive : ""}`}
              onClick={() => setPriceType("market_minus")}
            >
              Market -
            </button>
          </div>
        </div>

        {/* Price Input */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            {priceType === "fixed" ? "Price (USD)" : "Percentage"}
          </label>
          <div className={styles.inputWrapper}>
            {priceType === "fixed" && <span className={styles.inputPrefix}>$</span>}
            <input
              type="number"
              className={`${styles.input} ${priceType === "fixed" ? styles.inputWithPrefix : ""}`}
              placeholder={priceType === "fixed" ? "0.00" : "1.0"}
              step={priceType === "fixed" ? "0.01" : "0.1"}
              min="0"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
            />
            {priceType !== "fixed" && <span className={styles.inputSuffix}>%</span>}
          </div>
        </div>

        {/* Min / Max */}
        <div className={styles.inputRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Min Amount</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>$</span>
              <input
                type="number"
                className={`${styles.input} ${styles.inputWithPrefix}`}
                placeholder="10"
                min="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Max Amount</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>$</span>
              <input
                type="number"
                className={`${styles.input} ${styles.inputWithPrefix}`}
                placeholder="1,000"
                min="0"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
        {parsedMax > 0 && parsedMin > 0 && parsedMax <= parsedMin && (
          <p className={styles.validationError}>Max amount must be greater than min amount</p>
        )}

        {/* Payment Methods */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Payment Methods</label>
          <div className={styles.paymentGrid}>
            {PAYMENT_METHODS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className={`${styles.paymentChip} ${
                  selectedPayments.includes(value) ? styles.paymentChipSelected : ""
                }`}
                onClick={() => togglePayment(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Trade Type */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Trade Type</label>
          <div className={styles.pillToggle}>
            <button
              type="button"
              className={`${styles.pill} ${tradeType === "IN_PERSON" ? styles.pillActive : ""}`}
              onClick={() => setTradeType("IN_PERSON")}
            >
              In Person
            </button>
            <button
              type="button"
              className={`${styles.pill} ${tradeType === "REMOTE" ? styles.pillActive : ""}`}
              onClick={() => setTradeType("REMOTE")}
            >
              Remote
            </button>
            <button
              type="button"
              className={`${styles.pill} ${tradeType === "BOTH" ? styles.pillActive : ""}`}
              onClick={() => setTradeType("BOTH")}
            >
              Both
            </button>
          </div>
        </div>

        {/* Liquidity Display */}
        <div className={styles.liquidityCard}>
          <div className={styles.liquidityHeader}>
            <span className={styles.liquidityLabel}>Available Liquidity</span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={fetchBalance}
              disabled={balanceLoading}
              aria-label="Refresh balance"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={balanceLoading ? styles.spinning : ""}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
          <div className={styles.liquidityValue}>
            {balanceLoading ? (
              <span className={styles.liquiditySkeleton} />
            ) : currentBalance !== null ? (
              <span className={showLowLiquidity ? styles.liquidityAmber : styles.liquidityGreen}>
                {currentBalance.toFixed(asset === "USDC" ? 2 : 4)} {asset}
              </span>
            ) : (
              <span className={styles.liquidityMuted}>--</span>
            )}
          </div>
          {showLowLiquidity && (
            <div className={styles.liquidityWarning}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Insufficient liquidity. Your listing will be hidden until you fund your wallet.</span>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="button"
          className={styles.submitButton}
          disabled={!isFormValid || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <span className={styles.spinnerInline} />
          ) : (
            "Create Listing"
          )}
        </button>
      </div>
    </div>
  );
}

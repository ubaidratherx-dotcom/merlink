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

  const [asset, setAsset] = useState<"USDC" | "USDT" | "SOL" | "ETH" | "BTC">("USDC");
  const [chain, setChain] = useState<"solana" | "ethereum">("solana");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [priceValue, setPriceValue] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [tradeType, setTradeType] = useState<"IN_PERSON" | "REMOTE" | "BOTH">("BOTH");
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [paymentInstructions, setPaymentInstructions] = useState("");

  const [balance, setBalance] = useState<Record<string, number> | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [enablingSellerMode, setEnablingSellerMode] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Auto-set chain based on asset (SOL → solana, ETH → ethereum, USDC/USDT → user picks)
  const needsChainPicker = asset === "USDC"; // only USDC exists on both chains
  const effectiveChain = asset === "SOL" ? "solana" : asset === "ETH" || asset === "USDT" ? "ethereum" : asset === "BTC" ? "bitcoin" : chain;
  const isEthChain = effectiveChain === "ethereum";
  const isBtcChain = effectiveChain === "bitcoin";
  const hasEthWallet = !!user?.ethWalletAddress;
  const hasBtcWallet = !!user?.btcAddress;

  const fetchBalance = useCallback(async () => {
    if (!hasWallet && !hasEthWallet && !hasBtcWallet) return;
    setBalanceLoading(true);
    try {
      if (isBtcChain && hasBtcWallet) {
        const btcData = await api.wallet.btcGetBalance();
        setBalance(btcData); // { btc }
      } else if (isEthChain && hasEthWallet) {
        const ethData = await api.wallet.ethGetBalance();
        setBalance(ethData); // { eth, usdc, usdt }
      } else if (hasWallet) {
        const data = await api.wallet.getBalance();
        setBalance(data); // { sol, usdc }
      }
    } catch {
      // silently fail
    } finally {
      setBalanceLoading(false);
    }
  }, [hasWallet, hasEthWallet, hasBtcWallet, isEthChain, isBtcChain]);

  useEffect(() => {
    if ((hasWallet || hasEthWallet || hasBtcWallet) && sellerMode) {
      fetchBalance();
    }
  }, [hasWallet, hasEthWallet, hasBtcWallet, sellerMode, fetchBalance, effectiveChain]);

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

  const currentBalance = balance
    ? asset === "SOL" ? (balance.sol ?? 0)
      : asset === "ETH" ? (balance.eth ?? 0)
      : asset === "USDC" ? (balance.usdc ?? 0)
      : asset === "USDT" ? (balance.usdt ?? 0)
      : asset === "BTC" ? (balance.btc ?? 0)
      : 0
    : null;

  const exceedsBalance = currentBalance !== null && parsedMax > 0 && parsedMax > currentBalance;

  const isFormValid =
    parsedPrice > 0 &&
    parsedMin > 0 &&
    parsedMax > parsedMin &&
    selectedPayments.length > 0 &&
    !exceedsBalance;

  const showLowLiquidity =
    currentBalance !== null && parsedMin > 0 && currentBalance < parsedMin;

  async function handleSubmit() {
    if (!isFormValid) return;
    setSubmitting(true);
    setError("");

    try {
      await api.listings.create({
        asset,
        chain: effectiveChain,
        priceType: priceType === "fixed" ? "FIXED" : priceType === "market_plus" ? "MARKET_PLUS" : "MARKET_MINUS",
        priceValue: parsedPrice,
        minAmount: parsedMin,
        maxAmount: parsedMax,
        paymentMethods: selectedPayments,
        tradeType,
        ...(paymentInstructions.trim() && { paymentInstructions: paymentInstructions.trim() }),
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
  if (!hasWallet && !hasEthWallet && !hasBtcWallet) {
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
            Link and verify a wallet to hold your listing liquidity
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
            {(["USDC", "USDT", "SOL", "ETH", "BTC"] as const).map((a) => (
              <button
                key={a}
                type="button"
                className={`${styles.pill} ${asset === a ? styles.pillActive : ""}`}
                onClick={() => { setAsset(a); setBalance(null); }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Chain Picker — only for USDC/USDT/BTC */}
        {needsChainPicker && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Chain</label>
            <div className={styles.pillToggle}>
              <button
                type="button"
                className={`${styles.pill} ${chain === "solana" ? styles.pillActive : ""}`}
                onClick={() => setChain("solana")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#9945FF" opacity="0.2"/><circle cx="12" cy="12" r="5" fill="#9945FF"/></svg>
                  Solana
                </span>
              </button>
              <button
                type="button"
                className={`${styles.pill} ${chain === "ethereum" ? styles.pillActive : ""}`}
                onClick={() => setChain("ethereum")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 1.5l-7 11.5 7 4 7-4L12 1.5z" fill="#627EEA" opacity="0.6"/><path d="M12 1.5v9.87l7 3.13L12 1.5z" fill="#627EEA"/></svg>
                  Ethereum
                </span>
              </button>
            </div>
          </div>
        )}

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
            <label className={styles.fieldLabel}>Min Amount ({asset})</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>{asset}</span>
              <input
                type="number"
                className={`${styles.input} ${styles.inputWithPrefix}`}
                placeholder={asset === "SOL" ? "0.1" : "10"}
                min="0"
                step="any"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Max Amount ({asset})</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>{asset}</span>
              <input
                type="number"
                className={`${styles.input} ${styles.inputWithPrefix}`}
                placeholder={asset === "SOL" ? "10" : "1000"}
                min="0"
                step="any"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
        {parsedMax > 0 && parsedMin > 0 && parsedMax <= parsedMin && (
          <p className={styles.validationError}>Max amount must be greater than min amount</p>
        )}
        {exceedsBalance && (
          <p className={styles.validationError}>
            Max amount ({parsedMax} {asset}) exceeds your wallet balance ({currentBalance?.toFixed(asset === "BTC" ? 8 : 4)} {asset})
          </p>
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

        {/* Payment Instructions */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Payment Instructions (Optional)
          </label>
          <textarea
            className={styles.paymentInstructionsInput}
            placeholder="e.g., Bank: ABC Bank, Account: 1234567890, Name: John Doe"
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <span className={styles.paymentInstructionsHint}>
            Buyers will see this after escrow is locked so they know where to send payment
          </span>
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

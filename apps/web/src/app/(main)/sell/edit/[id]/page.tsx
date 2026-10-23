"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import styles from "../../page.module.css";

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

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [asset, setAsset] = useState<string>("USDC");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [priceValue, setPriceValue] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [tradeType, setTradeType] = useState("BOTH");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  const fetchListing = useCallback(async () => {
    try {
      const data: any = await api.listings.getById(id);
      setAsset(data.asset);
      setPriceType(
        data.priceType === "MARKET_PLUS" ? "market_plus" :
        data.priceType === "MARKET_MINUS" ? "market_minus" : "fixed"
      );
      setPriceValue(String(data.priceValue));
      setMinAmount(String(data.minAmount));
      setMaxAmount(String(data.maxAmount));
      setSelectedPayments(data.paymentMethods || []);
      setTradeType(data.tradeType || "BOTH");
      setPaymentInstructions(data.paymentInstructions || "");
    } catch (err: any) {
      setError(err.message || "Failed to load listing");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  function togglePayment(method: string) {
    setSelectedPayments((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const updates: Record<string, unknown> = {
        priceType: priceType === "fixed" ? "FIXED" : priceType === "market_plus" ? "MARKET_PLUS" : "MARKET_MINUS",
        tradeType,
        paymentMethods: selectedPayments,
      };
      const pv = parseFloat(priceValue);
      const mn = parseFloat(minAmount);
      const mx = parseFloat(maxAmount);
      if (pv > 0) updates.priceValue = pv;
      if (mn > 0) updates.minAmount = mn;
      if (mx > 0) updates.maxAmount = mx;
      if (paymentInstructions.trim()) updates.paymentInstructions = paymentInstructions.trim();
      await api.listings.update(id, updates);
      setSuccess(true);
      setTimeout(() => router.push("/sell/my-listings"), 1000);
    } catch (err: any) {
      setError(err.message || "Failed to update listing");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
          Loading listing...
        </div>
      </div>
    );
  }

  const parsedMin = parseFloat(minAmount) || 0;
  const parsedMax = parseFloat(maxAmount) || 0;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h1 className={styles.pageTitle}>Edit Listing</h1>
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

      {success && (
        <div className={styles.gateCard} style={{ borderColor: "rgba(22,199,132,0.2)" }}>
          <div className={styles.successIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Listing Updated!</h2>
          <p className={styles.gateSubtitle}>Redirecting to your listings...</p>
        </div>
      )}

      {!success && (
        <div className={styles.formSection}>
          {/* Asset (read-only) */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Asset</label>
            <div className={styles.pillToggle}>
              <span className={`${styles.pill} ${styles.pillActive}`}>{asset}</span>
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

          {/* Save */}
          <button
            type="button"
            className={styles.submitButton}
            disabled={saving || selectedPayments.length === 0 || !priceValue}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

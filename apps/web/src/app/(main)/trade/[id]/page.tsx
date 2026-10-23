"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  lockSolEscrow,
  lockTokenEscrow,
  releaseSolEscrow,
  releaseTokenEscrow,
  cancelSolEscrow,
  cancelTokenEscrow,
} from "@/lib/escrow/escrow";
import {
  lockEthEscrow,
  lockTokenEscrow as lockEthTokenEscrow,
  releaseEthEscrow,
  cancelEthEscrow,
} from "@/lib/escrow/eth-escrow";
import {
  createBtcEscrow,
  checkBtcDeposit,
  releaseBtcEscrow,
} from "@/lib/escrow/btc-escrow";
import {
  detectBtcWallets,
  getBtcWallet,
  type BtcWalletInfo,
} from "@/lib/btc-wallet";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  ESCROW_LOCKED: "Escrow Locked",
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_MARKED_SENT: "Payment Sent",
  RELEASE_PENDING: "Release Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  RESOLVED: "Resolved",
};

const STATUS_FLOW = [
  "CREATED",
  "ESCROW_LOCKED",
  "PAYMENT_MARKED_SENT",
  "COMPLETED",
];

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
};

function getStatusStyle(status: string) {
  const map: Record<string, string> = {
    CREATED: styles.statusCreated,
    ESCROW_LOCKED: styles.statusEscrowLocked,
    PAYMENT_PENDING: styles.statusEscrowLocked,
    PAYMENT_MARKED_SENT: styles.statusPaymentMarkedSent,
    RELEASE_PENDING: styles.statusReleasePending,
    COMPLETED: styles.statusCompleted,
    CANCELLED: styles.statusCancelled,
    DISPUTED: styles.statusDisputed,
    RESOLVED: styles.statusResolved,
  };
  return map[status] || "";
}

function useCountdown(deadline: string | null) {
  const [remaining, setRemaining] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!deadline) return;
    const target = new Date(deadline).getTime();

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        setUrgent(true);
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setRemaining(
        hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`
      );
      setUrgent(diff < 30 * 60 * 1000); // urgent if < 30 min
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return { remaining, urgent };
}

export default function TradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const tradeId = params.id as string;

  const { connection } = useConnection();
  const wallet = useWallet();

  const [trade, setTrade] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showEscrowConfirm, setShowEscrowConfirm] = useState(false);

  // Dispute evidence state
  const [disputeData, setDisputeData] = useState<any>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  // BTC wallet state
  const [btcWallets, setBtcWallets] = useState<BtcWalletInfo[]>([]);
  const [selectedBtcWallet, setSelectedBtcWallet] = useState<string>("");
  const [btcConnected, setBtcConnected] = useState(false);
  const [btcAddress, setBtcAddress] = useState("");
  const [btcPubkey, setBtcPubkey] = useState("");
  const [btcDeposit, setBtcDeposit] = useState<{ confirmed: boolean; amount: number; txid: string | null } | null>(null);
  const [showBtcWalletPicker, setShowBtcWalletPicker] = useState(false);
  const [btcCopied, setBtcCopied] = useState(false);
  const [btcClaimed, setBtcClaimed] = useState(false);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  useEffect(() => {
    api.prices.getAll().then(setMarketPrices).catch(() => {});
  }, []);

  // Check if user already reviewed this trade
  useEffect(() => {
    if (trade?.status === "COMPLETED") {
      api.reviews.hasReviewed(tradeId).then(data => {
        if (data.reviewed) setReviewDone(true);
      }).catch(() => {});
    }
  }, [trade?.status, tradeId]);

  const fetchTrade = useCallback(async () => {
    try {
      const data = await api.trades.getById(tradeId);
      setTrade(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load trade");
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    fetchTrade();
    // Mark chat as read when opening trade page
    api.chat.markRead(tradeId).catch(() => {});
  }, [fetchTrade, tradeId]);

  // Detect BTC wallets on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      setBtcWallets(detectBtcWallets());
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Poll BTC deposit status when chain is bitcoin
  const btcAutoLockDone = useRef(false);
  useEffect(() => {
    if (!trade || trade.chain !== "bitcoin") return;
    if (!trade.escrowAddress) return;
    // Keep polling for CANCELLED + RESOLVED (party may need to claim BTC refund/dispute funds)
    if (trade.status === "COMPLETED") return;

    const poll = async () => {
      try {
        const deposit = await checkBtcDeposit(trade.escrowAddress);
        setBtcDeposit(deposit);

        // Auto-confirm escrow lock when deposit is detected and trade is still CREATED
        if (deposit.confirmed && trade.status === "CREATED" && !btcAutoLockDone.current) {
          btcAutoLockDone.current = true;
          try {
            await api.trades.confirmEscrow(trade.id, `btc_escrow_${trade.escrowAddress}`);
            await fetchTrade();
          } catch (err: any) {
            btcAutoLockDone.current = false; // retry on next poll
            console.error("Auto-lock failed:", err);
          }
        }
      } catch {}
    };

    poll(); // initial check
    const interval = setInterval(poll, 15000); // every 15s
    return () => clearInterval(interval);
  }, [trade?.escrowAddress, trade?.chain, trade?.status, trade?.id, fetchTrade]);

  // Poll for updates (fallback if socket isn't connected)
  useEffect(() => {
    if (!trade || ["COMPLETED", "CANCELLED", "RESOLVED"].includes(trade.status))
      return;
    const interval = setInterval(fetchTrade, 10000);
    return () => clearInterval(interval);
  }, [trade?.status, fetchTrade]);

  // Determine chain
  const isEthChain = trade?.chain === "ethereum";
  const isBtcChain = trade?.chain === "bitcoin";

  // Fetch dispute data when trade is disputed
  useEffect(() => {
    if (trade?.status === "DISPUTED" || trade?.status === "RESOLVED") {
      api.disputes.getByTrade(tradeId).then((data: any) => {
        setDisputeData(data);
      }).catch(() => {});
    }
  }, [trade?.status, tradeId]);

  async function handleEvidenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !disputeData?.dispute?.id) return;
    setEvidenceUploading(true);
    try {
      await api.disputes.uploadScreenshot(disputeData.dispute.id, file);
      const updated = await api.disputes.getByTrade(tradeId);
      setDisputeData(updated);
    } catch (err: any) {
      setError(err.message || "Failed to upload evidence");
    } finally {
      setEvidenceUploading(false);
    }
  }

  const isBuyer = user?.id === trade?.buyerId;
  const isSeller = user?.id === trade?.sellerId;
  const counterparty = isBuyer ? trade?.seller : trade?.buyer;

  const paymentDeadline = useCountdown(trade?.paymentDeadline);

  // Chat: fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.chat.getMessages(tradeId);
      setMessages(data.messages);
      setChatHasMore(data.hasMore);
    } catch {
      // silently fail
    }
  }, [tradeId]);

  useEffect(() => {
    if (trade) fetchMessages();
  }, [trade?.id, fetchMessages]);

  // Poll for new messages
  useEffect(() => {
    if (!trade || ["CANCELLED"].includes(trade.status)) return;
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [trade?.status, fetchMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;
    setSendingChat(true);
    try {
      await api.chat.sendMessage(tradeId, chatInput.trim());
      setChatInput("");
      await fetchMessages();
    } catch {
      // silently fail
    } finally {
      setSendingChat(false);
    }
  }

  async function loadMoreMessages() {
    if (!messages.length || chatLoading) return;
    setChatLoading(true);
    try {
      const oldest = messages[0];
      const data = await api.chat.getMessages(tradeId, oldest.createdAt);
      setMessages([...data.messages, ...messages]);
      setChatHasMore(data.hasMore);
    } catch {
      // silently fail
    } finally {
      setChatLoading(false);
    }
  }

  async function handleAction(action: () => Promise<any>) {
    setActionLoading(true);
    try {
      await action();
      await fetchTrade();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setActionLoading(true);
    try {
      await api.trades.openDispute(tradeId, disputeReason.trim());
      setShowDispute(false);
      setDisputeReason("");
      await fetchTrade();
    } catch (err: any) {
      setError(err.message || "Failed to open dispute");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading trade...</div>
      </div>
    );
  }

  if (error && !trade) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p className={styles.errorText}>{error}</p>
          <button
            className={styles.secondaryAction}
            onClick={() => router.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!trade) return null;

  // Determine current step index for timeline
  const currentIdx = STATUS_FLOW.indexOf(trade.status);
  const isTerminal = ["CANCELLED", "DISPUTED", "RESOLVED"].includes(
    trade.status
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => router.back()}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className={styles.headerInfo}>
          <div className={styles.headerTitle}>
            {isBuyer ? "Buying" : "Selling"} {trade.asset}
          </div>
          <div className={styles.headerSubtitle}>
            Trade #{trade.id.slice(-8)}
          </div>
        </div>
        <span className={`${styles.statusBadge} ${getStatusStyle(trade.status)}`}>
          {STATUS_LABELS[trade.status]}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.card} style={{ borderColor: "rgba(255,69,58,0.3)" }}>
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Counterparty */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          {isBuyer ? "Seller" : "Buyer"}
        </div>
        <div className={styles.counterparty}>
          <div className={styles.avatar}>
            {counterparty?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div className={styles.counterpartyInfo}>
            <a href={`/trader/${counterparty?.id}`} className={styles.counterpartyName} style={{ textDecoration: "none", color: "inherit" }}>
              {counterparty?.username || "Unknown"}
            </a>
            <div className={styles.counterpartyRole}>
              {isBuyer ? "Seller" : "Buyer"}
            </div>
          </div>
        </div>
      </div>

      {/* Trade Details */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Trade Details</div>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Amount</span>
            <span className={styles.infoValueLarge}>
              {trade.amount} {trade.asset}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Price per {trade.asset}</span>
            <span className={styles.infoValue}>
              {(() => {
                const isMarket = trade.listing?.priceType === "MARKET_PLUS" || trade.listing?.priceType === "MARKET_MINUS";
                const pv = trade.listing?.priceValue || 0;
                // trade.price already contains the calculated price (since the price fix)
                // If it's a small number like 1-10, it's a legacy percentage — recalculate
                const mRate = marketPrices[trade.asset] || 0;
                let finalPrice = trade.price;
                if (isMarket && trade.price < 20 && mRate > 0) {
                  // Legacy trade: price is the raw percentage, recalculate
                  finalPrice = trade.listing.priceType === "MARKET_PLUS"
                    ? mRate * (1 + trade.price / 100)
                    : mRate * (1 - trade.price / 100);
                }
                return <>
                  ${finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {isMarket && <span style={{ fontSize: 11, fontWeight: 600, color: trade.listing.priceType === "MARKET_PLUS" ? "#16C784" : "#FF453A", marginLeft: 4 }}>
                    +{pv}%
                  </span>}
                </>;
              })()}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Payment</span>
            <span className={styles.infoValue}>
              {PAYMENT_LABEL[trade.paymentMethod] || trade.paymentMethod}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Type</span>
            <span className={styles.infoValue}>
              {trade.tradeType === "IN_PERSON" ? "In Person" : "Remote"}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Fee</span>
            <span className={styles.infoValue}>
              {trade.protocolFee.toFixed(4)} {trade.asset}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>
              {new Date(trade.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* BTC Escrow — Manual Send Flow */}
      {isBtcChain && trade.escrowAddress && !["COMPLETED", "CANCELLED", "RESOLVED"].includes(trade.status) && (
        <div className={styles.card}>
          <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#8383;</span> Bitcoin Escrow
          </div>

          {/* Step indicator for manual send (seller, pre-lock) */}
          {isSeller && trade.status === "CREATED" && (
            <div style={{ marginBottom: 12 }}>
              {/* Step 1: Send */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12,
                padding: "10px 12px", borderRadius: 10,
                background: (!btcDeposit || btcDeposit.amount === 0) ? "rgba(247,147,26,0.06)" : "rgba(22,199,132,0.06)",
                border: `1px solid ${(!btcDeposit || btcDeposit.amount === 0) ? "rgba(247,147,26,0.15)" : "rgba(22,199,132,0.15)"}`,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  background: (btcDeposit && btcDeposit.amount > 0) ? "#16C784" : "#F7931A",
                  color: "#fff",
                }}>
                  {(btcDeposit && btcDeposit.amount > 0) ? "✓" : "1"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                    {(btcDeposit && btcDeposit.amount > 0) ? "BTC Sent" : `Send ${trade.amount} BTC to escrow`}
                  </div>
                  {(!btcDeposit || btcDeposit.amount === 0) && (
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4, margin: 0 }}>
                      Your wallet doesn't support auto-send. Send <strong>{trade.amount} BTC</strong> manually using the address or QR code below.
                    </p>
                  )}
                </div>
              </div>

              {/* Step 2: Confirm */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: (btcDeposit?.confirmed) ? "rgba(22,199,132,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${btcDeposit?.confirmed ? "rgba(22,199,132,0.15)" : "var(--border)"}`,
                opacity: (!btcDeposit || btcDeposit.amount === 0) ? 0.5 : 1,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  background: btcDeposit?.confirmed ? "#16C784" : "var(--bg-tertiary)",
                  color: btcDeposit?.confirmed ? "#fff" : "var(--text-tertiary)",
                }}>
                  {btcDeposit?.confirmed ? "✓" : "2"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {btcDeposit?.confirmed ? "Escrow locked automatically" : "Auto-lock on confirmation"}
                  </div>
                  {!btcDeposit?.confirmed && (
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                      {btcDeposit && btcDeposit.amount > 0
                        ? "Waiting for blockchain confirmation — escrow will lock automatically..."
                        : "Escrow locks automatically once deposit is confirmed"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* QR Code — only for seller during manual send, before deposit */}
          {isSeller && trade.status === "CREATED" && (!btcDeposit || btcDeposit.amount === 0) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0" }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 12 }}>
                <QRCodeSVG
                  value={`bitcoin:${trade.escrowAddress}?amount=${trade.amount}`}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>
          )}

          {/* Address with copy */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 8, marginBottom: 10 }}>
            <span style={{ flex: 1, fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.4 }}>
              {trade.escrowAddress}
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(trade.escrowAddress);
                  setBtcCopied(true);
                  setTimeout(() => setBtcCopied(false), 2000);
                } catch {}
              }}
              style={{
                flexShrink: 0, padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: btcCopied ? "rgba(22,199,132,0.15)" : "rgba(247,147,26,0.1)",
                color: btcCopied ? "#16C784" : "#F7931A",
                border: "none", cursor: "pointer",
              }}
            >
              {btcCopied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Deposit status indicator */}
          {btcDeposit ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: btcDeposit.confirmed ? "rgba(22, 199, 132, 0.1)" : btcDeposit.amount > 0 ? "rgba(255, 159, 10, 0.1)" : "rgba(255, 69, 58, 0.1)" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: btcDeposit.confirmed ? "#16C784" : btcDeposit.amount > 0 ? "#FF9F0A" : "#FF453A",
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: btcDeposit.confirmed ? "#16C784" : btcDeposit.amount > 0 ? "#FF9F0A" : "#FF453A" }}>
                {btcDeposit.confirmed
                  ? `Confirmed: ${btcDeposit.amount} BTC`
                  : btcDeposit.amount > 0
                    ? `Pending: ${btcDeposit.amount} BTC (waiting for confirmation)`
                    : "Waiting for deposit..."}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-tertiary)" }}>
              <div style={{ width: 12, height: 12, border: "2px solid var(--text-tertiary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              Checking for deposit...
            </div>
          )}

          {isSeller && trade.status === "CREATED" && (!btcDeposit || !btcDeposit.confirmed) && (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8, textAlign: "center" }}>
              Send from any wallet — Ledger, Trezor, mobile, exchange. Deposit detected every 15s.
            </p>
          )}
        </div>
      )}

      {/* Payment Instructions — shown to buyer after escrow locked */}
      {isBuyer &&
        ["ESCROW_LOCKED", "PAYMENT_MARKED_SENT"].includes(trade.status) &&
        trade.listing?.paymentInstructions && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Payment Instructions</div>
            <p style={{ color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {trade.listing.paymentInstructions}
            </p>
          </div>
        )}

      {/* Countdown timers */}
      {trade.status === "ESCROW_LOCKED" && trade.paymentDeadline && (
        <div
          className={`${styles.countdown} ${paymentDeadline.urgent ? styles.countdownUrgent : ""}`}
        >
          <svg
            className={styles.countdownIcon}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className={styles.countdownText}>
            Payment deadline: {paymentDeadline.remaining}
          </span>
        </div>
      )}

      {trade.status === "PAYMENT_MARKED_SENT" && isSeller && (
        <div className={styles.countdown}>
          <svg className={styles.countdownIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className={styles.countdownText}>
            Buyer marked payment sent. Check your bank and release when confirmed.
          </span>
        </div>
      )}
      {trade.status === "PAYMENT_MARKED_SENT" && isBuyer && (
        <div className={styles.countdown}>
          <svg className={styles.countdownIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className={styles.countdownText}>
            Waiting for seller to confirm receipt and release escrow. If seller doesn't respond, you can open a dispute.
          </span>
        </div>
      )}

      {/* Status Timeline */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Status Timeline</div>
        <div className={styles.timeline}>
          {STATUS_FLOW.map((status, idx) => {
            const isCompleted = !isTerminal && currentIdx > idx;
            const isCurrent = !isTerminal && currentIdx === idx;
            const log = trade.stateLogs?.find(
              (l: any) => l.toStatus === status
            );

            return (
              <div key={status} className={styles.timelineItem}>
                <div
                  className={`${styles.timelineDot} ${
                    isCompleted
                      ? styles.timelineDotCompleted
                      : isCurrent
                        ? styles.timelineDotActive
                        : ""
                  }`}
                />
                <div
                  className={`${styles.timelineLine} ${
                    isCompleted ? styles.timelineLineCompleted : ""
                  }`}
                />
                <div className={styles.timelineContent}>
                  <div
                    className={`${styles.timelineLabel} ${
                      !isCompleted && !isCurrent
                        ? styles.timelineLabelInactive
                        : ""
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </div>
                  {log && (
                    <div className={styles.timelineTime}>
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Show terminal states */}
          {isTerminal && (
            <div className={styles.timelineItem}>
              <div
                className={`${styles.timelineDot} ${
                  trade.status === "RESOLVED"
                    ? styles.timelineDotCompleted
                    : styles.timelineDotActive
                }`}
              />
              <div className={styles.timelineContent}>
                <div className={styles.timelineLabel}>
                  {STATUS_LABELS[trade.status]}
                </div>
                {trade.stateLogs?.find(
                  (l: any) => l.toStatus === trade.status
                ) && (
                  <div className={styles.timelineTime}>
                    {new Date(
                      trade.stateLogs.find(
                        (l: any) => l.toStatus === trade.status
                      ).createdAt
                    ).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispute info */}
      {trade.dispute && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Dispute</div>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            <strong>Reason:</strong> {trade.dispute.reason}
          </p>
          {trade.dispute.resolution && (
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              <strong>Resolution:</strong>{" "}
              {trade.dispute.resolution === "RELEASE_TO_BUYER"
                ? "Released to buyer"
                : "Refunded to seller"}
            </p>
          )}
        </div>
      )}

      {/* Chat */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Chat</div>
        <div className={styles.chatSection}>
          <div className={styles.chatMessages}>
            {chatHasMore && (
              <button
                className={styles.loadMoreBtn}
                onClick={loadMoreMessages}
                disabled={chatLoading}
              >
                {chatLoading ? "Loading..." : "Load older messages"}
              </button>
            )}
            {messages.length === 0 ? (
              <div className={styles.chatEmpty}>
                No messages yet. Say hello!
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.senderId === user?.id;
                const isAdminMsg = msg.isAdmin;

                const bubbleBg = isAdminMsg
                  ? "linear-gradient(135deg, #FFF8E1, #FFF3CD)"
                  : isMine
                    ? "#7B5EFF"
                    : "var(--bg-secondary)";
                const bubbleColor = isAdminMsg
                  ? "#8B6914"
                  : isMine ? "#fff" : "var(--text-primary)";
                const bubbleBorder = isAdminMsg ? "1px solid #FFD700" : "none";
                const bubbleRadius = isAdminMsg
                  ? "14px 14px 14px 4px"
                  : isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px";

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isMine ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      alignSelf: isMine ? "flex-end" : "flex-start",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, padding: "0 4px" }}>
                      {isAdminMsg && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "2px 8px", borderRadius: 4,
                          background: "linear-gradient(135deg, #FFD700, #FFA500)",
                          color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                        }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                          ADMIN
                        </span>
                      )}
                      {!isMine && !isAdminMsg && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)" }}>
                          {msg.sender?.username || "Unknown"}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{
                      padding: "10px 16px",
                      borderRadius: bubbleRadius,
                      background: bubbleBg,
                      color: bubbleColor,
                      fontSize: 14,
                      lineHeight: 1.4,
                      border: bubbleBorder,
                      boxShadow: isAdminMsg ? "0 1px 4px rgba(255,215,0,0.15)" : "none",
                      opacity: msg.isBlocked ? 0.5 : 1,
                      fontStyle: msg.isBlocked ? "italic" : "normal",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {!["CANCELLED", "RESOLVED"].includes(trade.status) && (
            <form className={styles.chatInputRow} onSubmit={handleSendMessage}>
              <input
                className={styles.chatInput}
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                type="submit"
                className={styles.chatSendBtn}
                disabled={!chatInput.trim() || sendingChat}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* BTC: Prompt buyer to connect wallet if missing btcPubkey */}
      {isBtcChain && isBuyer && !trade.buyer?.btcPubkey && !["COMPLETED", "CANCELLED", "RESOLVED"].includes(trade.status) && (
        <div className={styles.card} style={{ borderLeft: "3px solid #FF9F0A" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FF9F0A", marginBottom: 6 }}>
            BTC Wallet Required
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
            Connect your Bitcoin wallet so the seller can create the escrow multisig.
            Without it, the trade cannot proceed.
          </p>
          <button
            onClick={() => window.location.href = "/profile/wallet"}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "rgba(247,147,26,0.1)", color: "#F7931A", border: "1px solid rgba(247,147,26,0.2)",
              cursor: "pointer",
            }}
          >
            Connect BTC Wallet
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!["COMPLETED", "CANCELLED", "RESOLVED"].includes(trade.status) && (
        <div className={styles.actions}>
          {/* Seller: Lock Escrow */}
          {isSeller && trade.status === "CREATED" && (
            <button
              className={styles.primaryAction}
              disabled={actionLoading}
              onClick={() => setShowEscrowConfirm(true)}
            >
              {actionLoading ? "Processing..." : "Lock Escrow"}
            </button>
          )}

          {/* Buyer: Mark Payment Sent */}
          {isBuyer && trade.status === "ESCROW_LOCKED" && (
            trade.paymentDeadline && new Date() > new Date(trade.paymentDeadline) ? (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,69,58,0.06)", color: "#FF453A", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                Payment deadline expired — trade will be cancelled automatically
              </div>
            ) : (
              <button
                className={styles.primaryAction}
                disabled={actionLoading}
                onClick={() =>
                  handleAction(() => api.trades.markPaymentSent(tradeId))
                }
              >
                {actionLoading ? "Processing..." : "Mark Payment Sent"}
              </button>
            )
          )}

          {/* Seller: Confirm & Release */}
          {isSeller && trade.status === "PAYMENT_MARKED_SENT" && isBtcChain && !btcConnected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center" }}>
                Connect BTC wallet to sign release
              </p>
              {btcWallets.filter(w => w.installed).map(w => (
                <button
                  key={w.id}
                  onClick={async () => {
                    try {
                      const adapter = getBtcWallet(w.id);
                      if (!adapter) return;
                      const result = await adapter.connect();
                      setBtcAddress(result.address);
                      setBtcPubkey(result.publicKey);
                      setBtcConnected(true);
                      setSelectedBtcWallet(w.id);
                    } catch (err: any) {
                      setError(err?.message || `Failed to connect ${w.name}`);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "var(--bg-secondary)", border: "1px solid var(--border)",
                    color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{w.icon}</span>
                  {w.name}
                </button>
              ))}
            </div>
          )}
          {isSeller && trade.status === "PAYMENT_MARKED_SENT" && !isBtcChain && !isEthChain && !wallet.publicKey && (
            <WalletMultiButton style={{ width: "100%", justifyContent: "center", height: 48, borderRadius: 12 }} />
          )}
          {isSeller && trade.status === "PAYMENT_MARKED_SENT" && (isBtcChain ? btcConnected : isEthChain ? true : wallet.publicKey) && (
            <button
              className={styles.primaryAction}
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                setActionStatus("Signing release transaction...");
                try {
                  setActionStatus("Releasing funds on-chain...");
                  if (isBtcChain) {
                    // BTC release: seller signs PSBT via connected wallet
                    const btcWalletAdapter = getBtcWallet(selectedBtcWallet);
                    if (!btcWalletAdapter) {
                      setError("Connect your Bitcoin wallet first");
                      setActionLoading(false);
                      return;
                    }
                    const recipientAddr = trade.buyer?.btcAddress;
                    if (!recipientAddr) {
                      setError("Buyer has no BTC address");
                      setActionLoading(false);
                      return;
                    }
                    await releaseBtcEscrow(tradeId, recipientAddr, btcAddress, btcWalletAdapter);
                  } else if (isEthChain) {
                    await releaseEthEscrow(tradeId);
                  } else {
                    if (!wallet.publicKey || !wallet.signTransaction) {
                      setError("Connect your Solana wallet"); setActionLoading(false); return;
                    }
                    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
                    if (!trade.buyer?.walletAddress) { setError("Buyer has no wallet connected"); setActionLoading(false); return; }
                    const buyerPubkey = new PublicKey(trade.buyer.walletAddress);
                    if (trade.asset === "SOL") {
                      await releaseSolEscrow(provider, tradeId, buyerPubkey);
                    } else {
                      await releaseTokenEscrow(provider, tradeId, buyerPubkey);
                    }
                  }

                  setActionStatus("Confirming with server...");
                  await api.trades.confirmRelease(tradeId);
                  await fetchTrade();
                  setActionStatus("");
                } catch (err: any) {
                  setError(err?.message || "Failed to release escrow");
                  setActionStatus("");
                } finally {
                  setActionLoading(false);
                }
              }}
            >
              {actionLoading ? (actionStatus || "Processing...") : "Confirm & Release"}
            </button>
          )}

          {/* Cancel (before payment sent) */}
          {["CREATED", "ESCROW_LOCKED"].includes(trade.status) && (
            <button
              className={styles.dangerAction}
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                try {
                  // If escrow was locked on-chain, cancel + refund
                  if (trade.status === "ESCROW_LOCKED") {
                    if (isBtcChain) {
                      // BTC: only seller can sign the refund PSBT
                      if (!isSeller) {
                        // Buyer cancels — just cancel in DB, seller claims refund later
                        setActionStatus("Cancelling trade...");
                        await api.trades.cancel(tradeId);
                        await fetchTrade();
                        setActionStatus("");
                        setActionLoading(false);
                        return;
                      }
                      // Seller cancels — sign refund PSBT
                      const btcWalletAdapter = getBtcWallet(selectedBtcWallet);
                      if (!btcWalletAdapter || !btcAddress) {
                        setError("Connect your Bitcoin wallet first to sign the refund");
                        setActionLoading(false);
                        return;
                      }
                      setActionStatus("Building refund transaction...");
                      const { psbtBase64 } = await api.btc.buildCancel(tradeId);
                      const psbtBytes = Uint8Array.from(atob(psbtBase64), c => c.charCodeAt(0));
                      setActionStatus("Sign the refund in your wallet...");
                      const maxInputs = 10;
                      const signingIndexes = Array.from({ length: maxInputs }, (_, i) => i);
                      const signedBytes = await btcWalletAdapter.signPSBT(psbtBytes, [{
                        address: btcAddress,
                        signingIndexes,
                      }]);
                      let binary = "";
                      const chunkSize = 8192;
                      for (let i = 0; i < signedBytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...signedBytes.subarray(i, i + chunkSize));
                      }
                      const signedBase64 = btoa(binary);
                      setActionStatus("Broadcasting refund...");
                      await api.btc.coSignCancel(tradeId, signedBase64);
                    } else if (isEthChain) {
                      setActionStatus("Cancelling escrow on-chain...");
                      await cancelEthEscrow(tradeId);
                    } else if (isSeller && wallet.publicKey && wallet.signTransaction) {
                      setActionStatus("Cancelling escrow on-chain...");
                      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
                      if (trade.asset === "SOL") {
                        await cancelSolEscrow(provider, tradeId);
                      } else {
                        await cancelTokenEscrow(provider, tradeId);
                      }
                    }
                  }
                  setActionStatus("Cancelling trade...");
                  await api.trades.cancel(tradeId);
                  await fetchTrade();
                  setActionStatus("");
                } catch (err: any) {
                  setError(err?.message || "Failed to cancel");
                  setActionStatus("");
                } finally {
                  setActionLoading(false);
                }
              }}
            >
              {actionLoading ? (actionStatus || "Cancelling...") : "Cancel Trade"}
            </button>
          )}

          {/* Dispute */}
          {["ESCROW_LOCKED", "PAYMENT_MARKED_SENT", "RELEASE_PENDING"].includes(
            trade.status
          ) && (
            <button
              className={styles.secondaryAction}
              disabled={actionLoading}
              onClick={() => setShowDispute(true)}
            >
              Open Dispute
            </button>
          )}
        </div>
      )}

      {/* BTC Claim Refund — seller on cancelled trade with funds still in escrow */}
      {/* (SOL/ETH are auto-refunded server-side, BTC requires seller to sign PSBT) */}
      {isBtcChain && isSeller && trade.status === "CANCELLED" && trade.escrowAddress && btcDeposit && btcDeposit.amount > 0 && !btcClaimed && (
        <div className={styles.card} style={{ borderLeft: "3px solid #FF9F0A" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FF9F0A", marginBottom: 6 }}>
            BTC Still in Escrow
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
            This trade was cancelled but {btcDeposit.amount} BTC is still in the escrow address. Connect your wallet to claim your refund.
          </p>
          {!btcConnected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {btcWallets.filter(w => w.installed).map(w => (
                <button
                  key={w.id}
                  onClick={async () => {
                    try {
                      const adapter = getBtcWallet(w.id);
                      if (!adapter) return;
                      const result = await adapter.connect();
                      setBtcAddress(result.address);
                      setBtcPubkey(result.publicKey);
                      setBtcConnected(true);
                      setSelectedBtcWallet(w.id);
                    } catch (err: any) {
                      setError(err?.message || `Failed to connect ${w.name}`);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "var(--bg-secondary)", border: "1px solid var(--border)",
                    color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{w.icon}</span>
                  {w.name}
                </button>
              ))}
            </div>
          ) : (
            <button
              className={styles.primaryAction}
              style={{ width: "100%", height: 44 }}
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                try {
                  const btcWalletAdapter = getBtcWallet(selectedBtcWallet);
                  if (!btcWalletAdapter) { setError("Connect wallet first"); setActionLoading(false); return; }
                  setActionStatus("Building refund transaction...");
                  const { psbtBase64 } = await api.btc.buildCancel(tradeId);
                  const psbtBytes = Uint8Array.from(atob(psbtBase64), c => c.charCodeAt(0));
                  setActionStatus("Sign the refund in your wallet...");
                  const signingIndexes = Array.from({ length: 10 }, (_, i) => i);
                  const signedBytes = await btcWalletAdapter.signPSBT(psbtBytes, [{
                    address: btcAddress,
                    signingIndexes,
                  }]);
                  let binary = "";
                  for (let i = 0; i < signedBytes.length; i += 8192) {
                    binary += String.fromCharCode(...signedBytes.subarray(i, i + 8192));
                  }
                  setActionStatus("Broadcasting refund...");
                  await api.btc.coSignCancel(tradeId, btoa(binary));
                  setBtcClaimed(true);
                  setActionStatus("");
                } catch (err: any) {
                  setError(err?.message || "Refund failed");
                  setActionStatus("");
                } finally {
                  setActionLoading(false);
                }
              }}
            >
              {actionLoading ? (actionStatus || "Processing...") : "Claim Refund"}
            </button>
          )}
        </div>
      )}

      {isBtcChain && trade.status === "RESOLVED" && trade.escrowAddress && disputeData?.dispute?.resolution && (() => {
        const isWinner = (disputeData.dispute.resolution === "RELEASE_TO_BUYER" && isBuyer)
          || (disputeData.dispute.resolution === "REFUND_TO_SELLER" && isSeller);
        if (!isWinner) return null;

        if (btcClaimed) {
          return (
            <div className={styles.card} style={{ borderLeft: "3px solid #16C784" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#16C784", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#16C784" }}>BTC Claimed Successfully</div>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>Funds have been sent to your wallet. It may take a few minutes to confirm.</p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className={styles.card} style={{ borderLeft: "3px solid #16C784" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#16C784", marginBottom: 6 }}>
              Claim Your BTC
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
              The dispute was resolved in your favor. {btcDeposit ? `${btcDeposit.amount} BTC` : "BTC"} is ready to claim. Connect your wallet and sign the transaction.
            </p>
            {!btcConnected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {btcWallets.filter(w => w.installed).map(w => (
                  <button
                    key={w.id}
                    onClick={async () => {
                      try {
                        const adapter = getBtcWallet(w.id);
                        if (!adapter) return;
                        const result = await adapter.connect();
                        setBtcAddress(result.address);
                        setBtcPubkey(result.publicKey);
                        setBtcConnected(true);
                        setSelectedBtcWallet(w.id);
                      } catch (err: any) {
                        setError(err?.message || `Failed to connect ${w.name}`);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 10,
                      background: "var(--bg-secondary)", border: "1px solid var(--border)",
                      color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{w.icon}</span>
                    {w.name}
                  </button>
                ))}
              </div>
            ) : (
              <button
                className={styles.primaryAction}
                style={{ width: "100%", height: 44 }}
                disabled={actionLoading}
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    const btcWalletAdapter = getBtcWallet(selectedBtcWallet);
                    if (!btcWalletAdapter) { setError("Connect wallet first"); setActionLoading(false); return; }
                    setActionStatus("Building claim transaction...");
                    const { psbtBase64 } = await api.btc.buildDisputeClaim(tradeId);
                    const psbtBytes = Uint8Array.from(atob(psbtBase64), c => c.charCodeAt(0));
                    setActionStatus("Sign in your wallet...");
                    const signingIndexes = Array.from({ length: 10 }, (_, i) => i);
                    const signedBytes = await btcWalletAdapter.signPSBT(psbtBytes, [{
                      address: btcAddress,
                      signingIndexes,
                    }]);
                    let binary = "";
                    for (let i = 0; i < signedBytes.length; i += 8192) {
                      binary += String.fromCharCode(...signedBytes.subarray(i, i + 8192));
                    }
                    setActionStatus("Broadcasting...");
                    await api.btc.coSignBroadcast(tradeId, btoa(binary));
                    setBtcClaimed(true);
                    setActionStatus("");
                  } catch (err: any) {
                    setError(err?.message || "Claim failed");
                    setActionStatus("");
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {actionLoading ? (actionStatus || "Processing...") : "Claim BTC"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Review Card — shown after trade completes */}
      {trade.status === "COMPLETED" && !reviewDone && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Rate this trade</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            How was your experience with {isBuyer ? trade.seller?.username : trade.buyer?.username}?
          </p>

          {/* Star rating */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setReviewRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 2,
                  fontSize: 28, color: star <= (hoverRating || reviewRating) ? "#FFD700" : "var(--border)",
                  transition: "color 0.1s, transform 0.1s",
                  transform: star <= (hoverRating || reviewRating) ? "scale(1.1)" : "scale(1)",
                }}
              >
                ★
              </button>
            ))}
          </div>

          {/* Comment */}
          <textarea
            value={reviewComment}
            onChange={e => setReviewComment(e.target.value)}
            placeholder="Leave a comment (optional)"
            maxLength={500}
            rows={2}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit",
              resize: "vertical", outline: "none", marginBottom: 10,
            }}
          />

          <button
            className={styles.primaryAction}
            style={{ width: "100%", height: 42, opacity: reviewRating === 0 ? 0.5 : 1 }}
            disabled={reviewRating === 0 || reviewSubmitting}
            onClick={async () => {
              setReviewSubmitting(true);
              try {
                await api.reviews.create({
                  tradeId,
                  rating: reviewRating,
                  comment: reviewComment.trim() || undefined,
                });
                setReviewDone(true);
              } catch (err: any) {
                setError(err?.message || "Failed to submit review");
              } finally {
                setReviewSubmitting(false);
              }
            }}
          >
            {reviewSubmitting ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      )}

      {trade.status === "COMPLETED" && reviewDone && (
        <div className={styles.card} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} style={{ color: s <= reviewRating ? "#FFD700" : "var(--border)" }}>★</span>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Thanks for your review!</p>
        </div>
      )}

      {/* Dispute Detail Section */}
      {(trade.status === "DISPUTED" || trade.status === "RESOLVED") && disputeData?.dispute && (() => {
        const resolution = disputeData.dispute.resolution;
        const userWon = resolution && (
          (resolution === "RELEASE_TO_BUYER" && isBuyer) ||
          (resolution === "REFUND_TO_SELLER" && isSeller)
        );
        const userLost = resolution && !userWon;
        const borderColor = !resolution
          ? "rgba(255,69,58,0.3)"
          : userWon
            ? "rgba(22,199,132,0.3)"
            : "rgba(255,69,58,0.3)";
        const statusColor = !resolution
          ? "#FF453A"
          : userWon
            ? "#16C784"
            : "#FF453A";

        return (
        <div className={styles.card} style={{ borderColor }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: statusColor, marginBottom: 12 }}>
            {!resolution
              ? "Dispute Open"
              : userWon
                ? "Dispute Resolved in Your Favor"
                : "Dispute Resolved Against You"}
          </h3>

          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>
            <strong>Reason:</strong> {disputeData.dispute.reason}
          </div>

          {resolution && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: userWon ? "rgba(22,199,132,0.08)" : "rgba(255,69,58,0.08)",
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>
                {resolution === "RELEASE_TO_BUYER" ? "Funds released to buyer" : "Funds refunded to seller"}
              </div>
              {disputeData.dispute.resolveNote && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                  {disputeData.dispute.resolveNote}
                </div>
              )}
            </div>
          )}

          {/* Evidence */}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Evidence ({disputeData.dispute.evidence?.length || 0})
            </h4>

            {disputeData.dispute.evidence?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {disputeData.dispute.evidence.map((ev: any) => (
                  <div key={ev.id} style={{ padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{ev.user?.username}</span>
                    {ev.type === "screenshot" ? (
                      <button onClick={() => setLightboxSrc(ev.content)} style={{ display: "block", marginTop: 6, cursor: "zoom-in", background: "none", padding: 0, border: "none" }}>
                        <img src={ev.content} alt="Evidence" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>Click to enlarge</div>
                      </button>
                    ) : (
                      <p style={{ marginTop: 4, color: "var(--text-secondary)" }}>{ev.content}</p>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, display: "block" }}>
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {trade.status === "DISPUTED" && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--aurora-tint)", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--aurora-start)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {evidenceUploading ? "Uploading..." : "Upload Screenshot"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleEvidenceUpload}
                  disabled={evidenceUploading}
                />
              </label>
            )}
          </div>
        </div>
        );
      })()}

      {/* Escrow confirmation modal */}
      {showEscrowConfirm && (
        <div
          className={styles.disputeOverlay}
          onClick={() => setShowEscrowConfirm(false)}
        >
          <div
            className={styles.disputeModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.disputeTitle}>Lock Escrow</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
              By locking escrow, you confirm that you are reserving{" "}
              <strong>{trade.amount} {trade.asset}</strong> for this trade.
              The buyer will have 24 hours to send fiat payment.
            </p>
            <div className={styles.disputeActions}>
              <button
                className={styles.disputeCancelBtn}
                onClick={() => setShowEscrowConfirm(false)}
              >
                Cancel
              </button>
              {/* BTC wallet picker */}
              {isBtcChain && !btcConnected && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8, width: "100%" }}>
                  <p style={{ color: "var(--alert-red, #FF453A)", fontSize: 13, textAlign: "center" }}>
                    Connect your Bitcoin wallet
                  </p>
                  {btcWallets.filter(w => w.installed).length === 0 ? (
                    <p style={{ color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                      No Bitcoin wallet detected. Install Phantom, Unisat, Xverse, Leather, or OKX wallet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {btcWallets.filter(w => w.installed).map(w => (
                        <button
                          key={w.id}
                          onClick={async () => {
                            try {
                              const adapter = getBtcWallet(w.id);
                              if (!adapter) return;
                              const result = await adapter.connect();
                              setBtcAddress(result.address);
                              setBtcPubkey(result.publicKey);
                              setBtcConnected(true);
                              setSelectedBtcWallet(w.id);
                            } catch (err: any) {
                              setError(err?.message || `Failed to connect ${w.name}`);
                            }
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 14px", borderRadius: 10,
                            background: "var(--bg-secondary)", border: "1px solid var(--border)",
                            color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{w.icon}</span>
                          {w.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isBtcChain && btcConnected && (
                <div style={{ padding: "8px 12px", background: "var(--aurora-tint)", borderRadius: 8, fontSize: 12, color: "var(--aurora-start)", marginBottom: 8, width: "100%" }}>
                  BTC Wallet: {btcAddress.slice(0, 8)}...{btcAddress.slice(-6)}
                </div>
              )}
              {/* SOL wallet connect */}
              {!isBtcChain && !isEthChain && !wallet.publicKey && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <p style={{ color: "var(--alert-red, #FF453A)", fontSize: 13, textAlign: "center" }}>
                    Connect your wallet to lock escrow
                  </p>
                  <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
                </div>
              )}
              <button
                className={styles.primaryAction}
                style={{ flex: 1, height: 48 }}
                disabled={actionLoading || (isBtcChain ? !btcConnected : (!wallet.publicKey && !isEthChain))}
                onClick={async () => {
                  setShowEscrowConfirm(false);
                  setActionLoading(true);
                  setActionStatus("Signing transaction...");
                  try {
                    let txSig: string;
                    setActionStatus("Locking funds on-chain...");

                    if (isBtcChain) {
                      if (!btcConnected || !btcPubkey) {
                        setError("Connect your Bitcoin wallet first using the wallet selector above");
                        setActionLoading(false);
                        return;
                      }
                      // Use the seller's stored pubkey from DB, not the connected wallet
                      const sellerPub = trade.seller?.btcPubkey;
                      const buyerPub = trade.buyer?.btcPubkey;
                      if (!sellerPub) {
                        setError("Seller needs a Bitcoin wallet connected in profile first");
                        setActionLoading(false);
                        return;
                      }
                      if (!buyerPub) {
                        setError("Buyer needs a Bitcoin wallet connected first");
                        setActionLoading(false);
                        return;
                      }
                      // Verify the connected wallet matches the seller's stored wallet
                      if (btcPubkey !== sellerPub) {
                        setError("Connected wallet doesn't match your registered BTC wallet. Switch to the correct wallet.");
                        setActionLoading(false);
                        return;
                      }

                      setActionStatus("Generating escrow address...");
                      const escrowResult = await createBtcEscrow(tradeId, sellerPub, buyerPub);

                      const btcWalletAdapter = getBtcWallet(selectedBtcWallet);
                      if (btcWalletAdapter?.canSend && btcWalletAdapter.sendBitcoin) {
                        // Auto-send: wallet popup → send → confirm
                        setActionStatus("Sending BTC to escrow...");
                        const satoshis = Math.round(trade.amount * 1e8);
                        const sendTxid = await btcWalletAdapter.sendBitcoin(escrowResult.address, satoshis);
                        txSig = sendTxid;
                      } else {
                        // Manual send: create address, refresh trade, let QR card take over
                        // Don't confirm yet — user must send manually first
                        await fetchTrade();
                        setActionLoading(false);
                        setActionStatus("");
                        return; // Exit early — don't call confirmEscrow
                      }
                    } else if (isEthChain) {
                      // Ethereum escrow
                      const buyerEthAddr = trade.buyer?.ethWalletAddress;
                      if (!buyerEthAddr) { setError("Buyer has no ETH wallet connected"); setActionLoading(false); return; }
                      if (trade.asset === "ETH") {
                        txSig = await lockEthEscrow(tradeId, buyerEthAddr, trade.amount);
                      } else {
                        txSig = await lockEthTokenEscrow(tradeId, buyerEthAddr, trade.asset, trade.amount);
                      }
                    } else {
                      // Solana escrow
                      if (!wallet.publicKey || !wallet.signTransaction) {
                        setError("Please connect your Solana wallet first");
                        setActionLoading(false);
                        return;
                      }
                      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
                      if (!trade.buyer?.walletAddress) { setError("Buyer has no wallet connected"); setActionLoading(false); return; }
                      const buyerPubkey = new PublicKey(trade.buyer.walletAddress);
                      if (trade.asset === "SOL") {
                        txSig = await lockSolEscrow(provider, tradeId, buyerPubkey, trade.amount);
                      } else {
                        txSig = await lockTokenEscrow(provider, tradeId, buyerPubkey, trade.amount);
                      }
                    }

                    setActionStatus("Confirming with server...");
                    console.log("Escrow tx sig:", txSig);
                    await api.trades.confirmEscrow(tradeId, txSig);
                    await fetchTrade();
                    setActionStatus("");
                  } catch (err: any) {
                    console.error("Lock escrow error:", err);
                    setError(err?.message || "Failed to lock escrow");
                    setActionStatus("");
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {actionLoading ? (actionStatus || "Processing...") : "Confirm Lock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute modal */}
      {showDispute && (
        <div
          className={styles.disputeOverlay}
          onClick={() => setShowDispute(false)}
        >
          <div
            className={styles.disputeModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.disputeTitle}>Open Dispute</h3>
            <textarea
              className={styles.disputeTextarea}
              placeholder="Describe the issue..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div className={styles.disputeActions}>
              <button
                className={styles.disputeCancelBtn}
                onClick={() => setShowDispute(false)}
              >
                Cancel
              </button>
              <button
                className={styles.disputeSubmitBtn}
                disabled={!disputeReason.trim() || actionLoading}
                onClick={handleDispute}
              >
                {actionLoading ? "Submitting..." : "Submit Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 24 }}>
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img src={lightboxSrc} alt="Evidence" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }} onClick={(e) => e.stopPropagation()} />
            <button onClick={() => setLightboxSrc(null)} style={{ position: "absolute", top: -12, right: -12, width: 32, height: 32, borderRadius: 16, background: "#fff", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

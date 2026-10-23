"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  disputeReleaseSol,
  disputeCancelSol,
  disputeReleaseToken,
  disputeCancelToken,
  markEscrowDisputed,
} from "@/lib/escrow/escrow";
import {
  markEthDisputed,
  disputeReleaseEth,
  disputeCancelEth,
} from "@/lib/escrow/eth-escrow";
import { api } from "@/lib/api";

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer", CASH: "Cash", WISE: "Wise",
  REVOLUT: "Revolut", MOBILE_MONEY: "Mobile Money", PAYPAL: "PayPal", OTHER: "Other",
};

export default function DisputeCaseDetail() {
  const { id: tradeId } = useParams<{ id: string }>();
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError("");
    Promise.all([
      api.disputes.getByTrade(tradeId),
      api.prices.getAll().catch(() => ({})),
    ])
      .then(([disputeData, priceData]) => { setData(disputeData); setPrices(priceData); })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tradeId]);

  async function handleResolve(resolution: "RELEASE_TO_BUYER" | "REFUND_TO_SELLER") {
    if (!data) return;
    setResolving(true);
    setError("");

    try {
      const trade = data.trade;
      const isEth = trade.asset === "ETH" || trade.chain === "ethereum";
      const isBtc = trade.chain === "bitcoin";

      if (isBtc) {
        // BTC dispute: server-side resolution via API
        // The backend builds the PSBT and handles signing with admin key
        // For BTC disputes, the winning party will need to co-sign via the "Claim" flow,
        // or if platform key is configured, admin can force-release
      } else if (isEth) {
        // Ethereum dispute resolution
        try {
          await markEthDisputed(tradeId);
        } catch (e: any) {
          if (!e.message?.includes("already") && !e.message?.includes("disputed")) throw e;
        }

        if (resolution === "RELEASE_TO_BUYER") {
          await disputeReleaseEth(tradeId);
        } else {
          await disputeCancelEth(tradeId);
        }
      } else {
        // Solana dispute resolution
        if (!wallet.publicKey || !wallet.signTransaction) {
          setError("Connect your Solana wallet to resolve");
          setResolving(false);
          return;
        }
        const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
        const sellerPubkey = new PublicKey(trade.seller.walletAddress);
        const buyerPubkey = new PublicKey(trade.buyer.walletAddress);

        try {
          await markEscrowDisputed(provider, tradeId);
        } catch (e: any) {
          if (!e.message?.includes("IsDisputed") && !e.message?.includes("AlreadyDisputed") && !e.message?.includes("already disputed")) throw e;
        }

        if (resolution === "RELEASE_TO_BUYER") {
          if (trade.asset === "SOL") {
            await disputeReleaseSol(provider, tradeId, sellerPubkey, buyerPubkey);
          } else {
            await disputeReleaseToken(provider, tradeId, sellerPubkey, buyerPubkey);
          }
        } else {
          if (trade.asset === "SOL") {
            await disputeCancelSol(provider, tradeId, sellerPubkey, buyerPubkey);
          } else {
            await disputeCancelToken(provider, tradeId, sellerPubkey, buyerPubkey);
          }
        }
      }

      // Backend
      await api.disputes.resolve(data.dispute.id, resolution, resolveNote || undefined);
      const updated = await api.disputes.getByTrade(tradeId);
      setData(updated);
    } catch (err: any) {
      setError(err.message || "Failed to resolve");
    } finally {
      setResolving(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading case...</div>;
  if (error && !data) return <div style={{ padding: 40, textAlign: "center", color: "#FF453A" }}>{error}</div>;
  if (!data) return null;

  const { trade, dispute } = data;
  const isResolved = !!dispute.resolution;

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <button onClick={() => router.push("/admin")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Dashboard
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dispute Case</h1>
      <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24 }}>Trade: {trade.id.slice(0, 12)}...</p>

      {error && <div style={{ padding: "12px 16px", background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)", borderRadius: 12, color: "#FF453A", fontSize: 14, marginBottom: 16 }}>{error}</div>}

      {(() => {
        // Calculate real price from market data
        const isMarket = trade.listing?.priceType === "MARKET_PLUS" || trade.listing?.priceType === "MARKET_MINUS";
        const marketRate = prices[trade.asset] || 0;
        const pv = trade.listing?.priceValue || 0;
        // New trades store calculated price, old ones store percentage
        let unitPrice = trade.price;
        if (isMarket && trade.price < 20 && marketRate > 0) {
          // Legacy: recalculate from percentage
          unitPrice = trade.listing.priceType === "MARKET_PLUS"
            ? marketRate * (1 + trade.price / 100)
            : marketRate * (1 - trade.price / 100);
        }
        const tradeValue = trade.amount * unitPrice;
        return (<>

      {/* Trade Info Card */}
      <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{trade.amount} {trade.asset}</span>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
            background: isResolved ? "rgba(22,199,132,0.08)" : "rgba(255,69,58,0.08)",
            color: isResolved ? "#16C784" : "#FF453A",
          }}>
            {isResolved ? "RESOLVED" : "DISPUTED"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Buyer</span>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{trade.buyer.username}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", wordBreak: "break-all" }}>{trade.buyer.walletAddress?.slice(0, 16)}...</div>
          </div>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Seller</span>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{trade.seller.username}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", wordBreak: "break-all" }}>{trade.seller.walletAddress?.slice(0, 16)}...</div>
          </div>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Payment</span>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{PAYMENT_LABEL[trade.paymentMethod] || trade.paymentMethod}</div>
          </div>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Price per {trade.asset}</span>
            <div style={{ fontWeight: 600, marginTop: 2 }}>
              ${unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {isMarket && <span style={{ fontSize: 11, fontWeight: 600, color: trade.listing.priceType === "MARKET_PLUS" ? "#16C784" : "#FF453A", marginLeft: 4 }}>
                +{pv}%
              </span>}
            </div>
          </div>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Total Trade Value</span>
            <div style={{ fontWeight: 700, marginTop: 2, fontSize: 16, color: "#16C784" }}>
              ${tradeValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              {trade.amount} {trade.asset} × ${unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Dispute Reason */}
      <div style={{ background: "var(--surface-card)", border: "1px solid rgba(255,69,58,0.2)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
          Dispute Reason
        </div>
        <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{dispute.reason}</p>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
          Opened by <strong>{dispute.initiator?.username}</strong> on {new Date(dispute.createdAt).toLocaleString()}
        </div>
      </div>

      {/* Resolution (if resolved) */}
      {isResolved && (
        <div style={{ background: "var(--surface-card)", border: "1px solid rgba(22,199,132,0.2)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#16C784", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Resolution
          </div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            {dispute.resolution === "RELEASE_TO_BUYER" ? "Funds released to buyer" : "Funds refunded to seller"}
          </p>
          {dispute.resolveNote && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{dispute.resolveNote}</p>}
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            Resolved on {new Date(dispute.resolvedAt).toLocaleString()}
          </div>
        </div>
      )}

      {/* Evidence — Split by party */}
      {(() => {
        const buyerEvidence = (dispute.evidence || []).filter((ev: any) => ev.userId === trade.buyerId);
        const sellerEvidence = (dispute.evidence || []).filter((ev: any) => ev.userId === trade.sellerId);
        const totalCount = (dispute.evidence || []).length;

        return (
          <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 }}>
              Evidence ({totalCount})
            </div>

            {totalCount === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: 20 }}>No evidence submitted yet</p>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                {/* Buyer evidence column */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(22,199,132,0.15)", color: "#16C784", fontSize: 10, fontWeight: 800 }}>BUYER</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#16C784" }}>{trade.buyer.username}</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>({buyerEvidence.length})</span>
                  </div>
                  {buyerEvidence.length === 0 ? (
                    <div style={{ padding: 16, background: "rgba(22,199,132,0.04)", border: "1px dashed rgba(22,199,132,0.2)", borderRadius: 10, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
                      No evidence from buyer
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {buyerEvidence.map((ev: any) => (
                        <div key={ev.id} style={{ padding: 10, background: "rgba(22,199,132,0.04)", border: "1px solid rgba(22,199,132,0.15)", borderRadius: 10 }}>
                          {ev.type === "screenshot" ? (
                            <button onClick={() => setLightboxSrc(ev.content)} style={{ display: "block", cursor: "zoom-in", background: "none", padding: 0, border: "none" }}>
                              <img src={ev.content} alt="Evidence" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>Click to enlarge</div>
                            </button>
                          ) : (
                            <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>{ev.content}</p>
                          )}
                          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>{new Date(ev.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ width: 1, background: "var(--divider)" }} />

                {/* Seller evidence column */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(123,94,255,0.15)", color: "#7B5EFF", fontSize: 10, fontWeight: 800 }}>SELLER</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#7B5EFF" }}>{trade.seller.username}</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>({sellerEvidence.length})</span>
                  </div>
                  {sellerEvidence.length === 0 ? (
                    <div style={{ padding: 16, background: "rgba(123,94,255,0.04)", border: "1px dashed rgba(123,94,255,0.2)", borderRadius: 10, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
                      No evidence from seller
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sellerEvidence.map((ev: any) => (
                        <div key={ev.id} style={{ padding: 10, background: "rgba(123,94,255,0.04)", border: "1px solid rgba(123,94,255,0.15)", borderRadius: 10 }}>
                          {ev.type === "screenshot" ? (
                            <button onClick={() => setLightboxSrc(ev.content)} style={{ display: "block", cursor: "zoom-in", background: "none", padding: 0, border: "none" }}>
                              <img src={ev.content} alt="Evidence" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>Click to enlarge</div>
                            </button>
                          ) : (
                            <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>{ev.content}</p>
                          )}
                          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>{new Date(ev.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Live Chat — Admin Intervention */}
      <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 20px", background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Trade Chat {!isResolved && "— You can message both parties"}
        </div>

        {/* Dispute joined banner */}
        <div style={{ padding: "8px 20px", background: "rgba(255,69,58,0.06)", borderBottom: "1px solid rgba(255,69,58,0.1)", fontSize: 12, fontWeight: 600, color: "#FF453A", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          Dispute active — Admin intervention
        </div>

        {/* Messages */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
          {trade.chatMessages?.length > 0 ? (
            trade.chatMessages.map((msg: any) => {
              const isBuyerMsg = msg.senderId === trade.buyerId;
              const isSellerMsg = msg.senderId === trade.sellerId;
              const isAdminMsg = msg.isAdmin;

              const bubbleBg = isAdminMsg
                ? "linear-gradient(135deg, #FFF8E1, #FFF3CD)"
                : isBuyerMsg
                  ? "rgba(22, 199, 132, 0.08)"
                  : isSellerMsg
                    ? "rgba(123, 94, 255, 0.08)"
                    : "var(--bg-secondary)";

              const bubbleBorder = isAdminMsg
                ? "1px solid #FFD700"
                : isBuyerMsg
                  ? "1px solid rgba(22, 199, 132, 0.2)"
                  : isSellerMsg
                    ? "1px solid rgba(123, 94, 255, 0.2)"
                    : "none";

              const nameColor = isAdminMsg
                ? "#D4880F"
                : isBuyerMsg ? "#16C784" : "#7B5EFF";

              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isAdminMsg ? "flex-end" : isBuyerMsg ? "flex-start" : "flex-end",
                    maxWidth: "80%",
                    alignSelf: isAdminMsg ? "flex-end" : isBuyerMsg ? "flex-start" : "flex-end",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, padding: "0 4px" }}>
                    {isAdminMsg && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        ADMIN
                      </span>
                    )}
                    {isBuyerMsg && (
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(22,199,132,0.15)", color: "#16C784", fontSize: 9, fontWeight: 800 }}>BUYER</span>
                    )}
                    {isSellerMsg && (
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(123,94,255,0.15)", color: "#7B5EFF", fontSize: 9, fontWeight: 800 }}>SELLER</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, color: nameColor }}>{msg.sender?.username}</span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{
                    padding: "8px 14px",
                    borderRadius: isAdminMsg ? "14px 14px 4px 14px" : isBuyerMsg ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                    background: bubbleBg,
                    border: bubbleBorder,
                    color: isAdminMsg ? "#8B6914" : "var(--text-primary)",
                    fontSize: 14,
                    lineHeight: 1.4,
                    boxShadow: isAdminMsg ? "0 1px 4px rgba(255,215,0,0.15)" : "none",
                  }}>
                    {msg.isBlocked ? (
                      <span style={{ color: "#FF453A", fontStyle: "italic" }}>[BLOCKED: {msg.blockReason}]</span>
                    ) : msg.content}
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: 20 }}>No messages yet</p>
          )}
        </div>

        {/* Admin input */}
        {!isResolved && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const input = (e.target as any).adminMsg;
              const content = input.value.trim();
              if (!content) return;
              input.disabled = true;
              try {
                await api.disputes.sendAdminMessage(tradeId, content);
                input.value = "";
                // Refresh data to show new message
                const updated = await api.disputes.getByTrade(tradeId);
                setData(updated);
              } catch (err: any) {
                setError(err.message || "Failed to send");
              } finally {
                input.disabled = false;
                input.focus();
              }
            }}
            style={{ padding: "12px 16px", borderTop: "1px solid var(--divider)", display: "flex", gap: 8 }}
          >
            <input
              name="adminMsg"
              type="text"
              placeholder="Message both parties as admin..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 20, background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: 14, outline: "none" }}
            />
            <button type="submit" style={{ width: 40, height: 40, borderRadius: 20, background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        )}
      </div>

      {/* Resolution Actions (admin) */}
      {!isResolved && (
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
            Resolve Dispute
          </div>
          <input
            type="text"
            placeholder="Resolution note (optional)"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, marginBottom: 12, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => handleResolve("RELEASE_TO_BUYER")}
              disabled={resolving}
              style={{ flex: 1, height: 48, background: "linear-gradient(135deg, #16C784, #0EA66A)", color: "#fff", borderRadius: 12, fontWeight: 600, fontSize: 14, opacity: resolving ? 0.6 : 1 }}
            >
              {resolving ? "Processing on-chain..." : "Release to Buyer"}
            </button>
            <button
              onClick={() => handleResolve("REFUND_TO_SELLER")}
              disabled={resolving}
              style={{ flex: 1, height: 48, background: "linear-gradient(135deg, #FF9F0A, #FF6B00)", color: "#fff", borderRadius: 12, fontWeight: 600, fontSize: 14, opacity: resolving ? 0.6 : 1 }}
            >
              {resolving ? "Processing on-chain..." : "Refund to Seller"}
            </button>
          </div>
        </div>
      )}

      {/* Lightbox modal */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)", zIndex: 3000,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out", padding: 24,
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img
              src={lightboxSrc}
              alt="Evidence"
              style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxSrc(null)}
              style={{
                position: "absolute", top: -12, right: -12,
                width: 32, height: 32, borderRadius: 16,
                background: "#fff", color: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>); })()}
    </div>
  );
}

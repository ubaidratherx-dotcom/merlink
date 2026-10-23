"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

export default function AdminDisputesPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  useEffect(() => {
    api.disputes.getOpen()
      .then((data) => setDisputes(data || []))
      .catch((err) => setError(err.message || "Failed to load disputes"))
      .finally(() => setLoading(false));
  }, []);

  async function handleResolve(dispute: any, resolution: "RELEASE_TO_BUYER" | "REFUND_TO_SELLER") {
    setResolvingId(dispute.id);
    setError("");

    try {
      const tradeId = dispute.tradeId;
      const asset = dispute.trade.asset;
      const isEth = asset === "ETH" || dispute.trade.chain === "ethereum";
      const isBtc = dispute.trade.chain === "bitcoin";

      if (isBtc) {
        // BTC dispute: resolved server-side, no on-chain call from admin UI
        // Backend handles it via buildDisputeReleasePSBT + winning party co-signs
      } else if (isEth) {
        // Ethereum dispute
        try { await markEthDisputed(tradeId); } catch (e: any) {
          if (!e.message?.includes("already") && !e.message?.includes("disputed")) throw e;
        }
        if (resolution === "RELEASE_TO_BUYER") {
          await disputeReleaseEth(tradeId);
        } else {
          await disputeCancelEth(tradeId);
        }
      } else {
        // Solana dispute
        if (!wallet.publicKey || !wallet.signTransaction) {
          setError("Connect Solana wallet to resolve");
          setResolvingId(null);
          return;
        }
        const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
        const sellerPubkey = new PublicKey(dispute.trade.seller.walletAddress);
        const buyerPubkey = new PublicKey(dispute.trade.buyer.walletAddress);

        try { await markEscrowDisputed(provider, tradeId); } catch (e: any) {
          if (!e.message?.includes("IsDisputed") && !e.message?.includes("AlreadyDisputed") && !e.message?.includes("already disputed")) throw e;
        }

        if (resolution === "RELEASE_TO_BUYER") {
          if (asset === "SOL") {
            await disputeReleaseSol(provider, tradeId, sellerPubkey, buyerPubkey);
          } else {
            await disputeReleaseToken(provider, tradeId, sellerPubkey, buyerPubkey);
          }
        } else {
          if (asset === "SOL") {
            await disputeCancelSol(provider, tradeId, sellerPubkey, buyerPubkey);
          } else {
            await disputeCancelToken(provider, tradeId, sellerPubkey, buyerPubkey);
          }
        }
      }

      // Backend resolution
      await api.disputes.resolve(dispute.id, resolution, resolveNote || undefined);
      setDisputes((prev) => prev.filter((d) => d.id !== dispute.id));
      setResolveNote("");
    } catch (err: any) {
      setError(err.message || "Failed to resolve dispute");
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>
        Loading disputes...
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Admin: Open Disputes</h1>

      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)", borderRadius: 12, color: "#FF453A", fontSize: 14, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError("")} style={{ float: "right", color: "#FF453A" }}>✕</button>
        </div>
      )}

      {!wallet.publicKey && (
        <div style={{ padding: "16px", background: "var(--aurora-tint)", borderRadius: 12, marginBottom: 16, fontSize: 14, color: "var(--aurora-start)", fontWeight: 600 }}>
          Connect admin wallet to resolve disputes on-chain
          <button onClick={() => wallet.connect()} style={{ marginLeft: 12, padding: "6px 16px", background: "var(--aurora-start)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            Connect
          </button>
        </div>
      )}

      {disputes.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-tertiary)" }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No open disputes</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>All clear!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {disputes.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/admin/disputes/${d.tradeId}`)}
              style={{
                background: "var(--surface-card)", border: "1px solid rgba(255,69,58,0.2)", borderRadius: 16, padding: 20,
                textAlign: "left", width: "100%", cursor: "pointer", transition: "border-color 150ms ease",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{d.trade.amount} {d.trade.asset}</span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: d.trade.asset === "ETH" ? "rgba(98,126,234,0.1)" : "rgba(153,69,255,0.1)", color: d.trade.asset === "ETH" ? "#627EEA" : "#9945FF", fontWeight: 700 }}>
                    {d.trade.chain === "ethereum" ? "Ethereum" : "Solana"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {PAYMENT_LABEL[d.trade.paymentMethod] || d.trade.paymentMethod}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#FF453A", fontWeight: 600, padding: "3px 10px", background: "rgba(255,69,58,0.08)", borderRadius: 20 }}>
                  DISPUTED
                </span>
              </div>

              {/* Parties */}
              <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13 }}>
                <div>
                  <span style={{ color: "#16C784", fontWeight: 600 }}>Buyer: </span>
                  <span style={{ fontWeight: 600 }}>{d.trade.buyer.username}</span>
                </div>
                <div>
                  <span style={{ color: "#7B5EFF", fontWeight: 600 }}>Seller: </span>
                  <span style={{ fontWeight: 600 }}>{d.trade.seller.username}</span>
                </div>
              </div>

              {/* Reason */}
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                {d.reason.length > 80 ? d.reason.slice(0, 80) + "..." : d.reason}
              </div>

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <div style={{ display: "flex", gap: 10, color: "var(--text-tertiary)" }}>
                  <span>Opened by {d.initiator.username}</span>
                  {d.evidence?.length > 0 && <span>{d.evidence.length} evidence</span>}
                </div>
                <span style={{ color: "var(--aurora-start)", fontWeight: 600 }}>
                  Review case →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

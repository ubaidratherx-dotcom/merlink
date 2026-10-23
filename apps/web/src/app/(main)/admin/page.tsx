"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ openDisputes: 0 });
  const [recentDisputes, setRecentDisputes] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.disputes.getOpen().catch(() => []),
      api.prices.getAll().catch(() => ({})),
    ]).then(([disputes, priceData]) => {
      setRecentDisputes(disputes?.slice(0, 5) || []);
      setStats({ openDisputes: disputes?.length || 0 });
      setPrices(priceData);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: stats.openDisputes > 0 ? "#FF453A" : "var(--text-primary)" }}>
            {stats.openDisputes}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Disputes
          </div>
        </div>
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--aurora-start)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Escrow Active
          </div>
        </div>
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#16C784" }}>0%</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Fee Rate
          </div>
        </div>
      </div>

      {/* Live Market Prices */}
      {Object.keys(prices).length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, overflowX: "auto" }}>
          {Object.entries(prices).filter(([k]) => ["SOL", "ETH", "BTC"].includes(k)).map(([asset, usd]) => (
            <div key={asset} style={{ flex: 1, minWidth: 100, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{asset}/USD</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          ))}
        </div>
      )}

      {/* Open Disputes */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Open Disputes</h2>
          {stats.openDisputes > 0 && (
            <button
              onClick={() => router.push("/admin/disputes")}
              style={{ fontSize: 13, fontWeight: 600, color: "var(--aurora-start)" }}
            >
              View all →
            </button>
          )}
        </div>

        {recentDisputes.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>All clear</p>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>No open disputes to review</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentDisputes.map((d: any) => (
              <button
                key={d.id}
                onClick={() => router.push(`/admin/disputes/${d.tradeId}`)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", background: "var(--surface-card)", border: "1px solid rgba(255,69,58,0.2)",
                  borderRadius: 12, textAlign: "left", width: "100%", transition: "background 150ms ease",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                    {d.trade?.amount} {d.trade?.asset} — {d.initiator?.username}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {d.reason?.slice(0, 60)}{d.reason?.length > 60 ? "..." : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {d.evidence?.length > 0 && (
                    <span style={{ fontSize: 11, padding: "2px 8px", background: "var(--bg-secondary)", borderRadius: 20, color: "var(--text-tertiary)", fontWeight: 600 }}>
                      {d.evidence.length} evidence
                    </span>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => router.push("/admin/disputes")}
            style={{ padding: 16, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 12, textAlign: "left" }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Review Disputes</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>View and resolve open cases</div>
          </button>
          <button
            onClick={() => router.push("/discover")}
            style={{ padding: 16, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 12, textAlign: "left" }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Marketplace</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Back to the main app</div>
          </button>
        </div>
      </div>
    </div>
  );
}

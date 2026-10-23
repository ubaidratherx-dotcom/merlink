"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const ADMIN_WALLET = "EJhPhzqWsNvwuWBTpyUViuuc5Gh2AwiYEwSCT7rzHnuJ";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isAdmin = wallet.publicKey?.toBase58() === ADMIN_WALLET;

  if (!wallet.connected) {
    return (
      <div style={{ padding: 40, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(123,94,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Admin Access</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 24, lineHeight: 1.5 }}>
          Connect your admin wallet to access the dashboard
        </p>
        <WalletMultiButton style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(255,69,58,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Access Denied</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 8, lineHeight: 1.5 }}>
          Connected wallet is not the admin wallet.
        </p>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", wordBreak: "break-all" }}>
          Connected: {wallet.publicKey?.toBase58()}
        </p>
        <button
          onClick={() => wallet.disconnect()}
          style={{ marginTop: 16, padding: "10px 24px", background: "var(--bg-secondary)", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}
        >
          Disconnect & Try Another
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Admin header bar */}
      <div style={{
        padding: "12px 24px",
        background: "linear-gradient(135deg, #7B5EFF, #5B3FD9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: "0 0 16px 16px",
        marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Merlink Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/admin" style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Dashboard</a>
          <a href="/admin/disputes" style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Disputes</a>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
            {wallet.publicKey?.toBase58().slice(0, 8)}...
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

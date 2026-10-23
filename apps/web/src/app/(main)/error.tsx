"use client";

import { useEffect } from "react";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "40px 20px", textAlign: "center", gap: 12,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "rgba(255, 69, 58, 0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
        There was a problem loading this page. Please try again.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px", borderRadius: 10,
            background: "var(--aurora-gradient)", color: "#fff",
            fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
          }}
        >
          Try Again
        </button>
        <a
          href="/"
          style={{
            padding: "10px 24px", borderRadius: 10,
            background: "var(--bg-secondary)", color: "var(--text-secondary)",
            fontSize: 14, fontWeight: 600, textDecoration: "none",
            border: "1px solid var(--border)",
          }}
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

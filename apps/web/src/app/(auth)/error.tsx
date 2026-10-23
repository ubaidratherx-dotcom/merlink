"use client";

import { useEffect } from "react";

export default function AuthError({
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
      minHeight: "80vh", padding: "40px 20px", textAlign: "center", gap: 12,
    }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: 0 }}>
        Please try again.
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
          href="/login"
          style={{
            padding: "10px 24px", borderRadius: 10,
            background: "var(--bg-secondary)", color: "var(--text-secondary)",
            fontSize: 14, fontWeight: 600, textDecoration: "none",
            border: "1px solid var(--border)",
          }}
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", padding: "40px 20px", textAlign: "center", gap: 12,
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: "#888" }}>An unexpected error occurred.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 8, padding: "10px 24px", borderRadius: 10,
              background: "linear-gradient(135deg, #7B5EFF, #4B2FD4)", color: "#fff",
              fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}

export default function OfflinePage() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: 40, textAlign: "center", background: "#0a0a0a", color: "#fff",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>You're offline</h1>
      <p style={{ fontSize: 14, color: "#888", maxWidth: 280, lineHeight: 1.5 }}>
        Check your internet connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 20, padding: "12px 28px", borderRadius: 12,
          background: "linear-gradient(135deg, #7B5EFF, #4B2FD4)", color: "#fff",
          fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

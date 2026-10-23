"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

function TwoFactorSection() {
  const { user, updateUser } = useAuthStore();
  const is2FAEnabled = !!(user as any)?.twoFactorEnabled;

  const [step, setStep] = useState<"idle" | "setup" | "verify" | "disable">("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSetup() {
    setLoading(true);
    setError("");
    try {
      const data = await api.auth.setup2FA();
      setQrCode(data.qrCodeDataUrl);
      setSecret(data.secret);
      setStep("verify");
    } catch (err: any) {
      setError(err.message || "Failed to set up 2FA");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) { setError("Enter a 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      await api.auth.verify2FA(code);
      updateUser({ twoFactorEnabled: true } as any);
      setSuccess("2FA enabled successfully");
      setStep("idle");
      setCode("");
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    if (code.length !== 6) { setError("Enter a 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      await api.auth.disable2FA(code);
      updateUser({ twoFactorEnabled: false } as any);
      setSuccess("2FA disabled");
      setStep("idle");
      setCode("");
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Two-Factor Authentication</h2>
      <p className={styles.desc}>
        {is2FAEnabled
          ? "2FA is enabled. You'll need your authenticator app to log in."
          : "Add an extra layer of security with an authenticator app."}
      </p>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {step === "idle" && !is2FAEnabled && (
        <button className={styles.btn} onClick={handleSetup} disabled={loading}>
          {loading ? "Setting up..." : "Enable 2FA"}
        </button>
      )}

      {step === "idle" && is2FAEnabled && (
        <button
          className={styles.btn}
          style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}
          onClick={() => { setStep("disable"); setError(""); setSuccess(""); setCode(""); }}
        >
          Disable 2FA
        </button>
      )}

      {step === "verify" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <p className={styles.desc} style={{ textAlign: "center" }}>
            Scan this QR code with Google Authenticator or Authy
          </p>
          {qrCode && <img src={qrCode} alt="2FA QR Code" style={{ width: 200, height: 200, borderRadius: 12 }} />}
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", wordBreak: "break-all", textAlign: "center", maxWidth: 280 }}>
            Manual key: {secret}
          </div>
          <input
            type="text"
            className={styles.input}
            placeholder="Enter 6-digit code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button className={styles.btn} style={{ flex: 1, background: "var(--bg-secondary)", color: "var(--text-secondary)" }} onClick={() => setStep("idle")}>Cancel</button>
            <button className={styles.btn} style={{ flex: 2 }} onClick={handleVerify} disabled={loading || code.length !== 6}>
              {loading ? "Verifying..." : "Verify & Enable"}
            </button>
          </div>
        </div>
      )}

      {step === "disable" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className={styles.desc}>Enter your authenticator code to disable 2FA.</p>
          <input
            type="text"
            className={styles.input}
            placeholder="Enter 6-digit code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className={styles.btn} style={{ flex: 1, background: "var(--bg-secondary)", color: "var(--text-secondary)" }} onClick={() => setStep("idle")}>Cancel</button>
            <button className={styles.btn} style={{ flex: 2, background: "rgba(255,69,58,0.1)", color: "#FF453A" }} onClick={handleDisable} disabled={loading || code.length !== 6}>
              {loading ? "Disabling..." : "Disable 2FA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SecurityPage() {
  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  // Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    api.auth.getSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  async function handleChangePassword() {
    setPwError("");
    setPwMsg("");
    if (newPw.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return; }
    setPwLoading(true);
    try {
      await api.auth.changePassword(currentPw, newPw);
      setPwMsg("Password changed successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    try {
      await api.auth.revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {} finally {
      setRevokingId(null);
    }
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div className={styles.container}>
      <Link href="/profile" className={styles.back}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Profile
      </Link>

      <h1 className={styles.heading}>Security</h1>

      {/* Change Password */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Change Password</h2>
        {pwError && <div className={styles.error}>{pwError}</div>}
        {pwMsg && <div className={styles.success}>{pwMsg}</div>}
        <input
          type="password"
          className={styles.input}
          placeholder="Current password"
          value={currentPw}
          onChange={e => setCurrentPw(e.target.value)}
        />
        <input
          type="password"
          className={styles.input}
          placeholder="New password (min 8 chars)"
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
        />
        <input
          type="password"
          className={styles.input}
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={e => setConfirmPw(e.target.value)}
        />
        <button
          className={styles.btn}
          onClick={handleChangePassword}
          disabled={pwLoading || !currentPw || !newPw || !confirmPw}
        >
          {pwLoading ? "Changing..." : "Change Password"}
        </button>
      </div>

      {/* 2FA */}
      <TwoFactorSection />

      {/* Active Sessions */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Active Sessions</h2>
        <p className={styles.desc}>Devices where you're currently logged in.</p>
        {sessionsLoading ? (
          <div className={styles.desc}>Loading...</div>
        ) : sessions.length === 0 ? (
          <div className={styles.desc}>No active sessions</div>
        ) : (
          <div className={styles.sessionList}>
            {sessions.map((s, i) => (
              <div key={s.id} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <span className={styles.sessionLabel}>
                    {i === 0 ? "This device" : `Session ${i + 1}`}
                  </span>
                  <span className={styles.sessionTime}>
                    Logged in {timeAgo(s.createdAt)}
                  </span>
                </div>
                {i !== 0 && (
                  <button
                    className={styles.revokeBtn}
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                  >
                    {revokingId === s.id ? "..." : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

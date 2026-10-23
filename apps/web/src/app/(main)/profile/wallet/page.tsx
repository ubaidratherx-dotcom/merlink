"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import type { User } from "@merlink/types";
import bs58 from "bs58";
import { detectBtcWallets, getBtcWallet, type BtcWalletInfo } from "@/lib/btc-wallet";
import styles from "./page.module.css";

const VERIFICATION_MESSAGE =
  "Sign this message to verify wallet ownership for CryptoMeet.";

const SUPPORTED_WALLETS = [
  {
    name: "Phantom",
    description: "Most popular Solana wallet",
    color: "#AB9FF2",
  },
  {
    name: "Solflare",
    description: "Secure Solana wallet",
    color: "#FC7227",
  },
  {
    name: "Backpack",
    description: "Multi-chain wallet by Coral",
    color: "#E33E3F",
  },
];

function BtcWalletConnect({ onConnect, onError, autoOpen = false }: { onConnect: (address: string, pubkey: string) => void; onError: (msg: string) => void; autoOpen?: boolean }) {
  const [wallets, setWallets] = useState<BtcWalletInfo[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [showPicker, setShowPicker] = useState(autoOpen);

  // Detect wallets multiple times — extensions can inject at different times
  useEffect(() => {
    const detect = () => setWallets(detectBtcWallets());
    detect(); // immediate
    const t1 = setTimeout(detect, 500);
    const t2 = setTimeout(detect, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const installed = wallets.filter(w => w.installed);

  return (
    <div style={{ marginTop: 12 }}>
      {!showPicker ? (
        <button
          style={{ width: "100%", padding: "12px 16px", background: "rgba(247,147,26,0.08)", border: "1px solid rgba(247,147,26,0.2)", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#F7931A", textAlign: "center", cursor: "pointer" }}
          onClick={() => setShowPicker(true)}
          disabled={connecting}
        >
          + Connect Bitcoin Wallet
        </button>
      ) : (
        <div style={{ border: "1px solid rgba(247,147,26,0.2)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "rgba(247,147,26,0.06)", fontSize: 13, fontWeight: 600, color: "#F7931A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Select BTC Wallet</span>
            <button onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 16 }}>x</button>
          </div>
          {installed.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
              No Bitcoin wallet detected.<br />Install Phantom, Unisat, Xverse, Leather, or OKX.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {installed.map(w => (
                <button
                  key={w.id}
                  disabled={connecting}
                  onClick={async () => {
                    setConnecting(true);
                    try {
                      const adapter = getBtcWallet(w.id);
                      if (!adapter) throw new Error(`${w.name} not available`);
                      const result = await adapter.connect();
                      onConnect(result.address, result.publicKey);
                      setShowPicker(false);
                    } catch (err: any) {
                      if (err?.code !== 4001) onError(err?.message || `Failed to connect ${w.name}`);
                    } finally {
                      setConnecting(false);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", background: "none",
                    borderTop: "1px solid var(--border)", border: "none", borderBottom: "1px solid var(--border)",
                    color: "var(--text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{w.icon}</span>
                  <span>{w.name}</span>
                  {connecting && <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>...</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  const { user, updateUser } = useAuthStore();
  const { connected, publicKey, signMessage, disconnect, connecting, select, wallets, connect, wallet } =
    useWallet();
  const { setVisible } = useWalletModal();

  const [signing, setSigning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<{ sol: number; usdc: number } | null>(
    null,
  );
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [copied, setCopied] = useState(false);

  // BTC wallet switch state
  const [showBtcSwitch, setShowBtcSwitch] = useState(false);

  // ETH wallet state
  const [ethConnecting, setEthConnecting] = useState(false);
  const [ethDisconnecting, setEthDisconnecting] = useState(false);
  const [ethBalance, setEthBalance] = useState<{ eth: number; usdc: number; usdt: number } | null>(null);
  const [ethLoadingBalance, setEthLoadingBalance] = useState(false);
  const [ethCopied, setEthCopied] = useState(false);

  // Track whether we've already attempted verification for this connection
  const verificationAttempted = useRef(false);

  const isWalletLinked = !!user?.walletAddress && user?.walletVerified;

  // Fetch balance when wallet is linked
  const fetchBalance = useCallback(async () => {
    if (!isWalletLinked) return;
    setLoadingBalance(true);
    try {
      const data = await api.wallet.getBalance();
      setBalance(data);
    } catch {
      // Balance fetch is non-critical, silently fail
    } finally {
      setLoadingBalance(false);
    }
  }, [isWalletLinked]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Auto-sign verification when wallet connects via adapter
  useEffect(() => {
    if (
      !connected ||
      !publicKey ||
      !signMessage ||
      isWalletLinked ||
      signing ||
      verificationAttempted.current
    ) {
      return;
    }

    verificationAttempted.current = true;

    async function verifyWallet() {
      setSigning(true);
      setError("");

      try {
        const encodedMessage = new TextEncoder().encode(VERIFICATION_MESSAGE);
        const signatureBytes = await signMessage!(encodedMessage);
        const signature = bs58.encode(signatureBytes);
        const walletAddress = publicKey!.toBase58();

        const updatedUser = await api.wallet.verify({
          walletAddress,
          signature,
          message: VERIFICATION_MESSAGE,
        });

        updateUser(updatedUser as Partial<User>);

        // Auto-connect ETH wallet if available (same Phantom wallet supports both)
        try {
          if ((window as any).ethereum) {
            const { BrowserProvider } = await import("ethers");
            const ethProvider = new BrowserProvider((window as any).ethereum);
            await ethProvider.send("eth_requestAccounts", []);
            const signer = await ethProvider.getSigner();
            const ethAddress = await signer.getAddress();
            const ethMessage = "Sign this message to verify Ethereum wallet ownership for CryptoMeet.";
            const ethSig = await signer.signMessage(ethMessage);
            const ethUser = await api.wallet.ethVerify({
              walletAddress: ethAddress,
              signature: ethSig,
              message: ethMessage,
            });
            updateUser(ethUser as Partial<User>);
          }
        } catch {
          // ETH auto-connect failed silently — user can connect manually later
        }
      } catch (err) {
        // User rejected signature or network error
        const message =
          err instanceof Error ? err.message : "Wallet verification failed";

        // If user rejected the signature, disconnect the adapter
        if (
          message.toLowerCase().includes("reject") ||
          message.toLowerCase().includes("denied") ||
          message.toLowerCase().includes("cancel")
        ) {
          setError("Signature rejected. Please try connecting again.");
        } else {
          setError(message);
        }

        try {
          await disconnect();
        } catch {
          // Ignore disconnect errors
        }
      } finally {
        setSigning(false);
      }
    }

    verifyWallet();
  }, [
    connected,
    publicKey,
    signMessage,
    isWalletLinked,
    signing,
    disconnect,
    updateUser,
  ]);

  // Auto-connect after wallet is selected
  useEffect(() => {
    if (wallet && !connected && !connecting) {
      connect().catch((err) => {
        console.error("Wallet connect error:", err);
        setError("Failed to connect wallet. Make sure your wallet is unlocked.");
      });
    }
  }, [wallet, connected, connecting, connect]);

  // Reset verification flag when wallet disconnects
  useEffect(() => {
    if (!connected) {
      verificationAttempted.current = false;
    }
  }, [connected]);

  function handleConnect() {
    setError("");
    const phantom = wallets.find(w => w.adapter.name === "Phantom");
    if (phantom && phantom.readyState === "Installed") {
      select(phantom.adapter.name);
    } else {
      setVisible(true);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError("");

    try {
      const updatedUser = await api.wallet.disconnect();
      updateUser(updatedUser as Partial<User>);
      setBalance(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to disconnect wallet",
      );
    }

    try {
      await disconnect();
    } catch {
      // Ignore adapter disconnect errors
    }

    setDisconnecting(false);
  }

  async function handleSwitchWallet() {
    setError("");
    // Disconnect current wallet from backend and adapter
    try {
      await api.wallet.disconnect();
      updateUser({ walletAddress: null, walletVerified: false } as Partial<User>);
      setBalance(null);
    } catch {
      // Continue even if backend disconnect fails
    }
    try {
      await disconnect();
    } catch {
      // Ignore
    }
    // Small delay to let adapter reset, then open connect flow
    verificationAttempted.current = false;
    setTimeout(() => {
      setVisible(true);
    }, 300);
  }


  async function handleCopy() {
    if (!user?.walletAddress) return;
    try {
      await navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  const walletIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );

  return (
    <div className={styles.container}>
      {/* Back link */}
      <Link href="/profile" className={styles.backLink}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Profile
      </Link>

      {error && <div className={styles.error}>{error}</div>}

      {isWalletLinked ? (
        <>
          {/* Connected state */}
          <div className={styles.header}>
            <h1 className={styles.heading}>Wallet</h1>
            <span
              className={`${styles.statusBadge} ${styles.statusConnected}`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Connected
            </span>
          </div>

          <div className={styles.connectedCard}>
            {/* Wallet address */}
            <div>
              <div className={styles.addressLabel}>Wallet Address</div>
              <div className={styles.addressRow}>
                <span className={styles.addressValue}>
                  {user.walletAddress}
                </span>
                <button
                  type="button"
                  className={`${styles.copyButton} ${copied ? styles.copySuccess : ""}`}
                  onClick={handleCopy}
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Balance */}
            <div className={styles.balanceSection}>
              <div className={styles.balanceTitle}>Balance</div>
              {loadingBalance ? (
                <div className={styles.spinnerDark} />
              ) : (
                <div className={styles.balanceGrid}>
                  <div className={styles.balanceItem}>
                    <div
                      className={`${styles.balanceIcon} ${styles.balanceIconSol}`}
                    >
                      S
                    </div>
                    <span className={styles.balanceAmount}>
                      {balance ? balance.sol.toFixed(4) : "--"}
                    </span>
                    <span className={styles.balanceAsset}>SOL</span>
                  </div>
                  <div className={styles.balanceItem}>
                    <div
                      className={`${styles.balanceIcon} ${styles.balanceIconUsdc}`}
                    >
                      $
                    </div>
                    <span className={styles.balanceAmount}>
                      {balance ? balance.usdc.toFixed(2) : "--"}
                    </span>
                    <span className={styles.balanceAsset}>USDC</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ETH Wallet — shown inside connected state */}
          {user?.ethWalletAddress ? (
            <div className={styles.connectedCard} style={{ marginTop: 12 }}>
              <div>
                <div className={styles.addressLabel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 1.5l-7 11.5 7 4 7-4L12 1.5z" fill="#627EEA" opacity="0.6"/><path d="M12 1.5v9.87l7 3.13L12 1.5z" fill="#627EEA"/></svg>
                  Ethereum
                </div>
                <div className={styles.addressRow}>
                  <span className={styles.addressValue} style={{ fontSize: 12 }}>{user.ethWalletAddress}</span>
                </div>
              </div>
              <div className={styles.balanceSection}>
                {ethBalance ? (
                  <div className={styles.balanceGrid}>
                    <div className={styles.balanceItem}>
                      <div className={styles.balanceIcon} style={{ background: "rgba(98,126,234,0.15)", color: "#627EEA" }}>E</div>
                      <span className={styles.balanceAmount}>{ethBalance.eth.toFixed(6)}</span>
                      <span className={styles.balanceAsset}>ETH</span>
                    </div>
                    <div className={styles.balanceItem}>
                      <div className={`${styles.balanceIcon} ${styles.balanceIconUsdc}`}>$</div>
                      <span className={styles.balanceAmount}>{ethBalance.usdc.toFixed(2)}</span>
                      <span className={styles.balanceAsset}>USDC</span>
                    </div>
                    <div className={styles.balanceItem}>
                      <div className={styles.balanceIcon} style={{ background: "rgba(38,161,123,0.15)", color: "#26A17B" }}>T</div>
                      <span className={styles.balanceAmount}>{ethBalance.usdt.toFixed(2)}</span>
                      <span className={styles.balanceAsset}>USDT</span>
                    </div>
                  </div>
                ) : (
                  <button
                    style={{ fontSize: 12, color: "#627EEA", fontWeight: 600 }}
                    onClick={async () => {
                      setEthLoadingBalance(true);
                      try { setEthBalance(await api.wallet.ethGetBalance()); } catch {} finally { setEthLoadingBalance(false); }
                    }}
                    disabled={ethLoadingBalance}
                  >
                    {ethLoadingBalance ? "Loading..." : "Show ETH Balance"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              style={{ marginTop: 12, width: "100%", padding: "12px 16px", background: "rgba(98,126,234,0.08)", border: "1px solid rgba(98,126,234,0.2)", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#627EEA", textAlign: "center" }}
              disabled={ethConnecting}
              onClick={async () => {
                setEthConnecting(true);
                try {
                  if (!(window as any).ethereum) { setError("No Ethereum wallet found"); return; }
                  const { BrowserProvider } = await import("ethers");
                  const ethProvider = new BrowserProvider((window as any).ethereum);
                  await ethProvider.send("eth_requestAccounts", []);
                  const signer = await ethProvider.getSigner();
                  const ethAddress = await signer.getAddress();
                  const ethMessage = "Sign this message to verify Ethereum wallet ownership for CryptoMeet.";
                  const ethSig = await signer.signMessage(ethMessage);
                  const updated = await api.wallet.ethVerify({ walletAddress: ethAddress, signature: ethSig, message: ethMessage });
                  updateUser(updated as Partial<User>);
                } catch (err: any) {
                  if (err?.code !== 4001) setError(err.message || "Failed to connect ETH wallet");
                } finally { setEthConnecting(false); }
              }}
            >
              {ethConnecting ? "Connecting ETH..." : "+ Connect Ethereum Wallet"}
            </button>
          )}

          {/* BTC Wallet */}
          {user?.btcAddress && !showBtcSwitch ? (
            <div className={styles.connectedCard} style={{ marginTop: 12 }}>
              <div>
                <div className={styles.addressLabel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#F7931A" opacity="0.2"/><text x="12" y="16" textAnchor="middle" fill="#F7931A" fontSize="12" fontWeight="bold">₿</text></svg>
                  Bitcoin
                </div>
                <div className={styles.addressRow}>
                  <span className={styles.addressValue} style={{ fontSize: 12 }}>{user.btcAddress}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setShowBtcSwitch(true)}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "rgba(247,147,26,0.08)", color: "#F7931A",
                  border: "1px solid rgba(247,147,26,0.15)", cursor: "pointer",
                }}
              >
                Switch BTC Wallet
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.wallet.btcDisconnect();
                    updateUser({ btcAddress: null, btcPubkey: null } as any);
                  } catch (err: any) {
                    setError(err?.message || "Failed to disconnect BTC wallet");
                  }
                }}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "rgba(255,69,58,0.08)", color: "#FF453A",
                  border: "1px solid rgba(255,69,58,0.15)", cursor: "pointer",
                }}
              >
                Disconnect
              </button>
              </div>
            </div>
          ) : (
            <BtcWalletConnect
              autoOpen={showBtcSwitch}
              onConnect={async (address, pubkey) => {
                try {
                  const updated = await api.wallet.btcConnect({ btcAddress: address, btcPubkey: pubkey });
                  updateUser(updated as any);
                  setShowBtcSwitch(false);
                } catch (err: any) {
                  setError(err.message || "Failed to connect BTC wallet");
                }
              }}
              onError={setError}
            />
          )}

          {/* Switch / Disconnect */}
          <div className={styles.walletActions}>
            <button
              type="button"
              className={styles.switchButton}
              onClick={handleSwitchWallet}
              disabled={disconnecting}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
                <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14" />
              </svg>
              Switch Wallet
            </button>
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect Wallet"}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Not connected state */}
          <div className={styles.header}>
            <h1 className={styles.heading}>Connect Wallet</h1>
            <p className={styles.subtitle}>
              Connect your Solana wallet to start trading
            </p>
          </div>

          {/* Supported wallets */}
          <div className={styles.walletGrid}>
            {SUPPORTED_WALLETS.map((w) => (
              <div key={w.name} className={styles.walletCard}>
                <div className={styles.walletIconWrapper}>{walletIcon}</div>
                <div className={styles.walletInfo}>
                  <span className={styles.walletName}>{w.name}</span>
                  <span className={styles.walletDesc}>{w.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Connect button */}
          <button
            type="button"
            className={styles.connectButton}
            onClick={handleConnect}
            disabled={connecting || signing}
          >
            {connecting ? (
              <>
                <span className={styles.spinner} />
                Connecting...
              </>
            ) : signing ? (
              <>
                <span className={styles.spinner} />
                Verifying...
              </>
            ) : (
              "Connect Wallet"
            )}
          </button>
        </>
      )}

    </div>
  );
}

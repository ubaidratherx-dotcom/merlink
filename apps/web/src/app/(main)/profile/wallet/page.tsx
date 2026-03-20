"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import type { User } from "@merlink/types";
import bs58 from "bs58";
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
    // Try to find and directly select a wallet, fallback to modal
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

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #7B5EFF, #9F8FFF)",
  "linear-gradient(135deg, #5BC4A8, #8EEDC7)",
  "linear-gradient(135deg, #6CB4EE, #A8D8FF)",
  "linear-gradient(135deg, #9B7EFF, #C4B1FF)",
  "linear-gradient(135deg, #4ECDC4, #7EEEE5)",
  "linear-gradient(135deg, #74B3F7, #B8D9FF)",
  "linear-gradient(135deg, #FF9F0A, #E88D00)",
  "linear-gradient(135deg, #E84393, #D63384)",
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  CREATED: { label: "Created", color: "var(--text-tertiary)" },
  ESCROW_LOCKED: { label: "Escrow Locked", color: "#FF9F0A" },
  PAYMENT_MARKED_SENT: { label: "Payment Sent", color: "#7B5EFF" },
  COMPLETED: { label: "Completed", color: "#16C784" },
  CANCELLED: { label: "Cancelled", color: "#FF453A" },
  DISPUTED: { label: "Disputed", color: "#FF453A" },
  RESOLVED: { label: "Resolved", color: "var(--text-tertiary)" },
};

const CHAIN_ICON: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bitcoin: "BTC",
};

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConvos = () => {
      api.chat.getConversations()
        .then(setConversations)
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchConvos();

    // Poll every 5 seconds for real-time feel
    const interval = setInterval(fetchConvos, 5000);

    // Also re-fetch on visibility change
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchConvos();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>Messages</h1>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={styles.shimmerRow}>
            <div className={styles.shimmerAvatar} />
            <div className={styles.shimmerLines}>
              <div className={styles.shimmerLine1} />
              <div className={styles.shimmerLine2} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>Messages</h1>
        <div className={styles.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <p className={styles.emptyTitle}>No messages yet</p>
          <p className={styles.emptySub}>Start a trade to begin chatting</p>
          <Link href="/discover" className={styles.emptyBtn}>Browse Marketplace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Messages</h1>
      <div className={styles.list}>
        {conversations.map(convo => {
          const hasUnread = convo.unreadCount > 0;
          return (
            <button
              key={convo.tradeId}
              className={styles.row}
              onClick={() => {
                // Optimistically mark as read locally
                setConversations(prev => prev.map(c =>
                  c.tradeId === convo.tradeId ? { ...c, unreadCount: 0 } : c
                ));
                api.chat.markRead(convo.tradeId).catch(() => {});
                router.push(`/trade/${convo.tradeId}`);
              }}
            >
              {/* Avatar */}
              <div className={styles.avatarWrap}>
                {convo.counterparty?.profilePhoto ? (
                  <img src={convo.counterparty.profilePhoto} alt="" className={styles.avatar} />
                ) : (
                  <div className={styles.avatarFallback} style={{ background: getAvatarGradient(convo.counterparty?.username || "?") }}>
                    {convo.counterparty?.username?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                {hasUnread && <span className={styles.onlineDot} />}
              </div>

              {/* Content */}
              <div className={styles.content}>
                <div className={styles.topRow}>
                  <span className={`${styles.name} ${hasUnread ? styles.nameBold : ""}`}>
                    {convo.counterparty?.username || "Unknown"}
                  </span>
                  <span className={`${styles.time} ${hasUnread ? styles.timeUnread : ""}`}>
                    {convo.lastMessage ? timeAgo(convo.lastMessage.createdAt) : ""}
                  </span>
                </div>
                <div className={styles.bottomRow}>
                  <span className={`${styles.preview} ${hasUnread ? styles.previewUnread : ""}`}>
                    {convo.lastMessage
                      ? `${convo.lastMessage.isOwn ? "You: " : ""}${convo.lastMessage.content}`
                      : "No messages"}
                  </span>
                  {hasUnread && (
                    <span className={styles.badge}>{convo.unreadCount > 9 ? "9+" : convo.unreadCount}</span>
                  )}
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.statusPill} style={{ color: STATUS_CONFIG[convo.status]?.color, background: `${STATUS_CONFIG[convo.status]?.color}12` }}>
                    {STATUS_CONFIG[convo.status]?.label || convo.status}
                  </span>
                  <span className={styles.tradeInfo}>{convo.amount} {convo.asset}</span>
                  <span className={styles.chainTag}>{CHAIN_ICON[convo.chain] || convo.chain}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

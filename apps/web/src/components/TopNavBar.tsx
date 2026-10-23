"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useNotificationStore, isNotificationsEnabled } from "@/stores/notification.store";
import styles from "./TopNavBar.module.css";

interface TopNavBarProps {
  title?: string;
}

export default function TopNavBar({ title }: TopNavBarProps) {
  const { user } = useAuthStore();
  const { notifications, unreadCount, markAllRead } = useNotificationStore();
  const notifEnabled = typeof window !== "undefined" ? isNotificationsEnabled() : true;
  const displayUnread = notifEnabled ? unreadCount : 0;
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showDropdown]);

  function getInitials(): string {
    if (!user?.username) return "?";
    return user.username
      .split(/[\s_-]+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function handleBellClick() {
    setShowDropdown((prev) => !prev);
    if (!showDropdown && displayUnread > 0) {
      markAllRead();
    }
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  return (
    <header
      className={`${styles.navBar} ${scrolled ? styles.navBarFrosted : styles.navBarTransparent}`}
    >
      <div className={styles.leftSection} />

      {title && <h1 className={styles.title}>{title}</h1>}

      <div className={styles.rightSection}>
        {/* Notification bell */}
        <div className={styles.bellWrapper} ref={dropdownRef}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Notifications"
            onClick={handleBellClick}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {displayUnread > 0 && (
              <span className={styles.bellBadge}>
                {displayUnread > 9 ? "9+" : displayUnread}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <div className={styles.notifDropdown}>
              <div className={styles.notifHeader}>
                <span className={styles.notifHeaderTitle}>Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className={styles.notifClear}
                    onClick={() => { useNotificationStore.getState().clearAll(); setShowDropdown(false); }}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className={styles.notifEmpty}>
                  <span>No notifications yet</span>
                </div>
              ) : (
                <div className={styles.notifList}>
                  {notifications.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ""}`}
                      onClick={() => {
                        setShowDropdown(false);
                        if (n.link) router.push(n.link);
                      }}
                    >
                      <div className={styles.notifDot}>
                        {!n.read && <span className={styles.notifDotActive} />}
                      </div>
                      <div className={styles.notifContent}>
                        <span className={styles.notifTitle}>{n.title}</span>
                        {n.subtitle && <span className={styles.notifSubtitle}>{n.subtitle}</span>}
                      </div>
                      <span className={styles.notifTime}>{timeAgo(n.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar */}
        <Link href="/profile" className={styles.avatar} aria-label="Profile">
          {user?.profilePhoto ? (
            <img
              src={user.profilePhoto}
              alt={user.username || "Profile"}
              className={styles.avatarImage}
            />
          ) : (
            <span className={styles.avatarInitials}>{getInitials()}</span>
          )}
        </Link>
      </div>
    </header>
  );
}

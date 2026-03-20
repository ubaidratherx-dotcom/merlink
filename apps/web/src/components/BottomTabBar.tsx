"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomTabBar.module.css";

const tabs = [
  { key: "discover", label: "Discover", href: "/" },
  { key: "trades", label: "Trades", href: "/trades" },
  { key: "sell", label: "Sell", href: "/sell" },
  { key: "messages", label: "Messages", href: "/messages" },
  { key: "profile", label: "Profile", href: "/profile" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/* --- Inline SVG icons (24px, 1.8px stroke, rounded) --- */

function DiscoverIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.36 6.64l-2.05 5.47a1 1 0 0 1-.56.56l-5.47 2.05c-.58.22-1.12-.32-.9-.9l2.05-5.47a1 1 0 0 1 .56-.56l5.47-2.05c.58-.22 1.12.32.9.9z" />
      <circle cx="12" cy="12" r="1.5" fill="white" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function TradesIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M16.5 3a1 1 0 0 1 .7.3l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.7-.7V10H7a1 1 0 1 1 0-2h8.5V6a1 1 0 0 1 1-1v-2zM7.5 11a1 1 0 0 1 .7.3 1 1 0 0 1 .3.7v2H17a1 1 0 1 1 0 2H8.5v2a1 1 0 0 1-1.7.7l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 .7-.3z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function MessagesIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 14c-6 0-9 3-9 5v1a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1c0-2-3-5-9-5z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabBar} role="tablist" aria-label="Main navigation">
      <ul className={styles.tabList}>
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);

          /* Center Sell FAB */
          if (tab.key === "sell") {
            return (
              <li key={tab.key} className={styles.fabItem}>
                <Link href={tab.href} className={styles.fabButton} aria-label="Sell">
                  <svg
                    className={styles.fabIcon}
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </Link>
              </li>
            );
          }

          const Icon =
            tab.key === "discover"
              ? DiscoverIcon
              : tab.key === "trades"
                ? TradesIcon
                : tab.key === "messages"
                  ? MessagesIcon
                  : ProfileIcon;

          return (
            <li key={tab.key} className={styles.tabItem}>
              <Link
                href={tab.href}
                className={`${styles.tabLink} ${active ? styles.tabLinkActive : ""}`}
                aria-selected={active}
                role="tab"
              >
                <span className={styles.tabIcon}>
                  {active && <span className={styles.activeDot} />}
                  <Icon active={active} />
                </span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

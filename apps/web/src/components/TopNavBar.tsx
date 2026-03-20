"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import styles from "./TopNavBar.module.css";

interface TopNavBarProps {
  title?: string;
}

export default function TopNavBar({ title }: TopNavBarProps) {
  const { user } = useAuthStore();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function getInitials(): string {
    if (!user?.username) return "?";
    return user.username
      .split(/[\s_-]+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <header
      className={`${styles.navBar} ${scrolled ? styles.navBarFrosted : styles.navBarTransparent}`}
    >
      <div className={styles.leftSection} />

      {title && <h1 className={styles.title}>{title}</h1>}

      <div className={styles.rightSection}>
        {/* Notification bell (placeholder) */}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Notifications"
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
        </button>

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

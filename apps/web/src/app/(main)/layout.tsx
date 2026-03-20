"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import TopNavBar from "@/components/TopNavBar";
import BottomTabBar from "@/components/BottomTabBar";
import styles from "./layout.module.css";

const routeTitles: Record<string, string> = {
  "/": "Discover",
  "/trades": "Trades",
  "/sell": "Create Listing",
  "/messages": "Messages",
  "/profile": "Profile",
  "/kyc": "Identity Verification",
};

function getTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  // Check prefix matches for sub-routes
  for (const [route, title] of Object.entries(routeTitles)) {
    if (route !== "/" && pathname.startsWith(route)) return title;
  }
  return "";
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.spinner} />
        <p style={{ marginTop: 16, color: "#8E8E93", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const title = getTitle(pathname);

  return (
    <div className={styles.wrapper}>
      <TopNavBar title={title} />
      <main className={styles.content}>{children}</main>
      <BottomTabBar />
    </div>
  );
}

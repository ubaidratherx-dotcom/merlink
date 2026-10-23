"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import TopNavBar from "@/components/TopNavBar";
import BottomTabBar from "@/components/BottomTabBar";
import ToastContainer, { showToast } from "@/components/Toast";
import { useNotificationStore, isNotificationsEnabled } from "@/stores/notification.store";
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
  const { user, isAuthenticated, isLoading, initialize } = useAuthStore();
  const socketRef = useRef<any>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const addNotification = useNotificationStore((s) => s.addNotification);
  const hydrateNotifications = useNotificationStore((s) => s.hydrate);

  useEffect(() => {
    initialize();
    hydrateNotifications();
  }, [initialize, hydrateNotifications]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !pathname.startsWith("/admin")) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  // Socket connection for trade notifications
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Prevent duplicate connections
    if (socketRef.current?.connected) return;

    let socket: any = null;
    let cancelled = false;
    (async () => {
      const { io } = await import("socket.io-client");
      if (cancelled) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";
      const tokens = localStorage.getItem("merlink_tokens");
      const accessToken = tokens ? JSON.parse(tokens).accessToken : null;
      if (!accessToken) return;

      socket = io(`${wsUrl}/trade`, {
        auth: { token: accessToken },
        transports: ["websocket"],
      });

      socketRef.current = socket;

      socket.on("trade-update", (data: any) => {
        const trade = data.trade;
        if (!trade) return;

        const isSeller = trade.sellerId === user.id;
        const isBuyer = trade.buyerId === user.id;

        const currentUser = userRef.current;
        if (!currentUser) return;
        if (trade.buyerId !== currentUser.id && trade.sellerId !== currentUser.id) return;

        const isMeSeller = trade.sellerId === currentUser.id;
        const isMeBuyer = trade.buyerId === currentUser.id;
        let msg = "";
        let type: "info" | "success" | "error" = "info";

        if (data.status === "CREATED" && isMeSeller) {
          msg = `New trade: ${trade.buyer?.username || "A buyer"} wants to buy ${trade.amount} ${trade.asset}`;
        } else if (data.status === "ESCROW_LOCKED" && isMeBuyer) {
          msg = `Escrow locked! Send your payment for ${trade.amount} ${trade.asset}`;
        } else if (data.status === "PAYMENT_MARKED_SENT" && isMeSeller) {
          msg = `Payment marked as sent for ${trade.amount} ${trade.asset} — please confirm`;
        } else if (data.status === "COMPLETED") {
          msg = `Trade completed! ${trade.amount} ${trade.asset}`;
          type = "success";
        } else if (data.status === "DISPUTED") {
          msg = `Trade disputed: ${trade.amount} ${trade.asset}`;
          type = "error";
        } else if (data.status === "CANCELLED") {
          msg = `Trade cancelled: ${trade.amount} ${trade.asset}`;
          type = "error";
        }

        if (msg && isNotificationsEnabled()) {
          showToast(msg, type, `/trade/${trade.id}`);
          addNotification({
            type: "trade-update",
            title: msg,
            link: `/trade/${trade.id}`,
          });
        }
      });

      // Buy request notifications for sellers
      socket.on("new-buy-request", (data: any) => {
        const br = data.buyRequest;
        if (!br) return;

        const currentUser = userRef.current;
        if (!currentUser) return;

        // Don't notify the buyer themselves
        if (br.buyerId === currentUser.id) return;

        // Only notify if user is a seller
        if (!currentUser.sellerMode) return;

        // Check if seller is nearby (within 100km)
        if (currentUser.latitude && currentUser.longitude && br.latitude && br.longitude) {
          const R = 6371;
          const dLat = ((br.latitude - currentUser.latitude) * Math.PI) / 180;
          const dLon = ((br.longitude - currentUser.longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((currentUser.latitude * Math.PI) / 180) *
              Math.cos((br.latitude * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          if (dist > 100) return; // Too far
        }

        const msg = `${br.buyer?.username || "A buyer"} wants to buy ${br.amount} ${br.asset} nearby`;
        const link = `/?tab=buyers&highlight=${br.id}`;
        if (!isNotificationsEnabled()) return;
        showToast(msg, "info", link);
        addNotification({
          type: "buy-request",
          title: msg,
          subtitle: `${br.amount} ${br.asset} via ${br.paymentMethod?.replace("_", " ").toLowerCase() || "any"}`,
          link,
        });
      });

      // Offer notifications for buyers
      socket.on("new-offer", (data: any) => {
        const offer = data.offer;
        if (!offer?.buyRequest) return;

        const currentUser = userRef.current;
        if (!currentUser) return;

        // Only notify the buyer who owns the buy request
        if (offer.buyRequest.buyerId !== currentUser.id) return;

        const msg = `${offer.seller?.username || "A seller"} offered $${offer.price}/${offer.buyRequest.asset} for your ${offer.buyRequest.amount} ${offer.buyRequest.asset} request`;
        showToast(msg, "info", `/buy-request/${offer.buyRequestId}`);
        addNotification({
          type: "buy-request",
          title: `New offer from ${offer.seller?.username || "a seller"}`,
          subtitle: `$${offer.price}/${offer.buyRequest.asset} for ${offer.buyRequest.amount} ${offer.buyRequest.asset}`,
          link: `/buy-request/${offer.buyRequestId}`,
        });
      });

      // Offer declined notifications for sellers
      socket.on("offer-declined", (data: any) => {
        const currentUser = userRef.current;
        if (!currentUser) return;
        if (data.sellerId !== currentUser.id) return;

        const msg = `${data.buyerUsername || "Buyer"} declined your offer for ${data.amount} ${data.asset}`;
        showToast(msg, "error");
        addNotification({
          type: "trade-update",
          title: "Offer declined",
          subtitle: `${data.amount} ${data.asset} — ${data.buyerUsername || "Buyer"} chose another offer`,
        });
      });

      // Offer accepted notifications for sellers
      socket.on("offer-accepted", (data: any) => {
        const currentUser = userRef.current;
        if (!currentUser) return;
        if (data.sellerId !== currentUser.id) return;

        const msg = `${data.buyerUsername || "Buyer"} accepted your offer for ${data.amount} ${data.asset}!`;
        showToast(msg, "success", `/trade/${data.tradeId}`);
        addNotification({
          type: "trade-update",
          title: "Offer accepted!",
          subtitle: `${data.amount} ${data.asset} — trade created with ${data.buyerUsername || "buyer"}`,
          link: `/trade/${data.tradeId}`,
        });
      });

      // Dispute resolved notifications
      socket.on("dispute-resolved", (data: any) => {
        const currentUser = userRef.current;
        if (!currentUser) return;
        if (data.buyerId !== currentUser.id && data.sellerId !== currentUser.id) return;

        const won = (data.resolution === "RELEASE_TO_BUYER" && data.buyerId === currentUser.id) ||
                    (data.resolution === "REFUND_TO_SELLER" && data.sellerId === currentUser.id);
        const msg = won
          ? "Dispute resolved in your favor!"
          : "Dispute resolved against you — funds went to the other party";
        showToast(msg, won ? "success" : "error", `/trade/${data.tradeId}`);
        addNotification({
          type: "trade-update",
          title: won ? "Dispute resolved in your favor" : "Dispute resolved",
          subtitle: data.note || (data.resolution === "RELEASE_TO_BUYER" ? "Funds released to buyer" : "Funds refunded to seller"),
          link: `/trade/${data.tradeId}`,
        });
      });

    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id]);

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
      <ToastContainer />
      <main className={styles.content}>{children}</main>
      <BottomTabBar />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
};

export default function BuyRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [buyRequest, setBuyRequest] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [br, offerList] = await Promise.all([
        api.buyRequests.getById(id),
        api.offers.getForBuyRequest(id),
      ]);
      setBuyRequest(br);
      setOffers(offerList);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAccept(offerId: string) {
    setAcceptingId(offerId);
    setError("");
    try {
      const trade: any = await api.offers.accept(offerId);
      router.push(`/trade/${trade.id}`);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to accept offer");
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleDecline(offerId: string) {
    setDecliningId(offerId);
    try {
      await api.offers.decline(offerId);
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to decline offer");
    } finally {
      setDecliningId(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loader}>
          <div className={styles.spinner} />
          <span>Loading buy request...</span>
        </div>
      </div>
    );
  }

  if (error && !buyRequest) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>{error}</p>
          <button type="button" className={styles.backButton} onClick={() => router.back()}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!buyRequest) return null;

  const isOwner = buyRequest.buyerId === user?.id;
  const isExpired = new Date(buyRequest.expiresAt) < new Date();
  const isActive = buyRequest.isActive && !isExpired;

  const timeLeft = () => {
    const diff = new Date(buyRequest.expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m left`;
    return `${Math.floor(min / 60)}h ${min % 60}m left`;
  };

  return (
    <div className={styles.container}>
      {/* Back button */}
      <button type="button" className={styles.backLink} onClick={() => router.back()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* Buy Request Card */}
      <div className={styles.requestCard}>
        <div className={styles.requestHeader}>
          <div className={styles.requestAvatar}>
            {buyRequest.buyer?.profilePhoto ? (
              <img src={buyRequest.buyer.profilePhoto} alt="" className={styles.requestAvatarImg} />
            ) : (
              <span className={styles.requestAvatarInitials}>
                {(buyRequest.buyer?.username || "U").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className={styles.requestTitle}>
              {isOwner ? "Your Buy Request" : `${buyRequest.buyer?.username}'s Request`}
            </h2>
            <span className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusExpired}`}>
              {isActive ? timeLeft() : isExpired ? "Expired" : "Completed"}
            </span>
          </div>
        </div>

        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Asset</span>
            <span className={styles.detailValue}>{buyRequest.asset}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Amount</span>
            <span className={styles.detailValue}>{buyRequest.amount}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Payment</span>
            <span className={styles.detailValue}>{PAYMENT_LABEL[buyRequest.paymentMethod] || buyRequest.paymentMethod}</span>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Offers Section */}
      <div className={styles.offersSection}>
        <h3 className={styles.offersTitle}>
          Offers {offers.length > 0 && <span className={styles.offerCount}>{offers.length}</span>}
        </h3>

        {offers.length === 0 ? (
          <div className={styles.emptyOffers}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>{isActive ? "Waiting for sellers to make offers..." : "No offers received"}</p>
          </div>
        ) : (
          <div className={styles.offersList}>
            {offers.map((offer: any) => (
              <div key={offer.id} className={styles.offerCard}>
                <div className={styles.offerHeader}>
                  <div className={styles.offerAvatar}>
                    {offer.seller?.profilePhoto ? (
                      <img src={offer.seller.profilePhoto} alt="" className={styles.requestAvatarImg} />
                    ) : (
                      <span className={styles.requestAvatarInitials}>
                        {(offer.seller?.username || "S").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className={styles.offerInfo}>
                    <span className={styles.offerSeller}>{offer.seller?.username || "Seller"}</span>
                    <div className={styles.offerMeta}>
                      {offer.seller?.rating > 0 && (
                        <span className={styles.offerRating}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF9F0A" stroke="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          {offer.seller.rating.toFixed(1)}
                        </span>
                      )}
                      {offer.seller?.totalTrades > 0 && (
                        <span className={styles.offerTrades}>{offer.seller.totalTrades} trades</span>
                      )}
                      <span className={styles.offerTradeType}>
                        {offer.tradeType === "REMOTE" ? "Remote" : "In Person"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.offerPriceRow}>
                  <div>
                    <span className={styles.offerPriceLabel}>Price per {buyRequest.asset}</span>
                    <span className={styles.offerPrice}>${offer.price.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className={styles.offerPriceLabel}>Total</span>
                    <span className={styles.offerTotal}>${(offer.price * buyRequest.amount).toFixed(2)}</span>
                  </div>
                </div>

                {isOwner && isActive && (
                  <div className={styles.offerActions}>
                    <button
                      type="button"
                      className={styles.declineButton}
                      onClick={() => handleDecline(offer.id)}
                      disabled={decliningId === offer.id}
                    >
                      {decliningId === offer.id ? "..." : "Decline"}
                    </button>
                    <button
                      type="button"
                      className={styles.acceptButton}
                      onClick={() => handleAccept(offer.id)}
                      disabled={acceptingId === offer.id}
                    >
                      {acceptingId === offer.id ? "Accepting..." : "Accept"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

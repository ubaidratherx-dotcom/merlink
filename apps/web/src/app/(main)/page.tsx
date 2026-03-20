"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import styles from "./page.module.css";

interface ListingItem {
  id: string;
  sellerId: string;
  seller?: {
    id: string;
    username: string;
    profilePhoto: string | null;
  };
  asset: "USDC" | "SOL";
  price: number;
  priceType: string;
  marketPercentage: number | null;
  minAmount: number;
  maxAmount: number;
  paymentMethods: string[];
  tradeType: string;
  availableLiquidity: number;
  isActive: boolean;
}

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CASH: "Cash",
  WISE: "Wise",
  REVOLUT: "Revolut",
  MOBILE_MONEY: "Mobile Money",
  PAYPAL: "PayPal",
  OTHER: "Other",
  "Bank Transfer": "Bank Transfer",
  Cash: "Cash",
  Wise: "Wise",
  Revolut: "Revolut",
  "Mobile Money": "Mobile Money",
  PayPal: "PayPal",
  Other: "Other",
};

const TRADE_TYPE_LABEL: Record<string, string> = {
  IN_PERSON: "In Person",
  REMOTE: "Remote",
  BOTH: "Both",
};

export default function DiscoverPage() {
  const { user, updateUser } = useAuthStore();

  const [locationLoading, setLocationLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [activeTab, setActiveTab] = useState<"sellers" | "buyers">("sellers");
  const [searchQuery, setSearchQuery] = useState("");

  const [listings, setListings] = useState<ListingItem[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsTotal, setListingsTotal] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  const kycStatus = user?.kycStatus || "UNVERIFIED";
  const hasLocation = !!(user?.latitude && user?.longitude);
  const showLocationBanner = !hasLocation;

  const fetchListings = useCallback(async () => {
    setListingsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      const data = await api.listings.getAll(params);
      setListings(data.listings || []);
      setListingsTotal(data.total || 0);
    } catch {
      // silently fail, show empty state
      setListings([]);
    } finally {
      setListingsLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === "sellers") {
      fetchListings();
    }
  }, [activeTab, fetchListings]);

  const handleEnableLocation = useCallback(async () => {
    setLocationLoading(true);
    setApiError("");

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        }
      );

      const { latitude, longitude } = position.coords;
      const updatedUser = await api.users.updateProfile({
        latitude,
        longitude,
      });
      updateUser(updatedUser);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setApiError(
          "Location access was denied. Please enable it in your browser settings."
        );
      } else {
        setApiError(
          err instanceof Error ? err.message : "Failed to update location"
        );
      }
    } finally {
      setLocationLoading(false);
    }
  }, [updateUser]);

  function handleRefresh() {
    setRefreshing(true);
    fetchListings();
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchListings();
  }

  function formatPrice(listing: ListingItem) {
    if (listing.priceType === "MARKET_PERCENTAGE" && listing.marketPercentage !== null) {
      const sign = listing.marketPercentage >= 0 ? "+" : "";
      return `Market ${sign}${listing.marketPercentage}%`;
    }
    return `$${listing.price.toFixed(2)}`;
  }

  function getSellerInitials(listing: ListingItem) {
    const name = listing.seller?.username || "U";
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {apiError && (
        <div className={styles.errorWrapper}>
          <ErrorBanner message={apiError} onDismiss={() => setApiError("")} />
        </div>
      )}

      {/* KYC Banners */}
      {kycStatus === "UNVERIFIED" && (
        <div className={styles.kycBanner}>
          <div className={styles.kycBannerContent}>
            <div className={styles.kycBannerIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className={styles.kycBannerText}>
              <p className={styles.kycBannerTitle}>
                Complete identity verification to start trading
              </p>
              <p className={styles.kycBannerSubtitle}>
                Verify your identity to access all Merlink features
              </p>
            </div>
            <Link href="/kyc" className={styles.kycBannerButton}>
              Verify Now
            </Link>
          </div>
        </div>
      )}

      {kycStatus === "PENDING" && (
        <div className={`${styles.kycBanner} ${styles.kycBannerPending}`}>
          <div className={styles.kycBannerContent}>
            <div className={`${styles.kycBannerIcon} ${styles.kycBannerIconPending}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className={styles.kycBannerText}>
              <p className={styles.kycBannerTitle}>Verification in progress</p>
              <p className={styles.kycBannerSubtitle}>
                We&apos;re reviewing your identity. This usually takes a few minutes.
              </p>
            </div>
            <span className={`${styles.kycStatusBadge} ${styles.kycStatusBadgePending}`}>
              Pending
            </span>
          </div>
        </div>
      )}

      {kycStatus === "VERIFIED" && (
        <div className={styles.kycVerifiedInline}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Verified</span>
        </div>
      )}

      {/* Location Banner */}
      {showLocationBanner && (
        <div className={styles.locationBanner}>
          <div className={styles.kycBannerContent}>
            <div className={styles.locationBannerIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7B5EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className={styles.kycBannerText}>
              <p className={styles.kycBannerTitle}>
                Enable location to discover traders nearby
              </p>
              <p className={styles.kycBannerSubtitle}>
                Share your location to find peer-to-peer trades in your area
              </p>
            </div>
            <button
              type="button"
              className={styles.kycBannerButton}
              onClick={handleEnableLocation}
              disabled={locationLoading}
            >
              {locationLoading ? "Locating..." : "Enable Location"}
            </button>
          </div>
        </div>
      )}

      {/* Search / Filter Bar */}
      <form className={styles.searchBar} onSubmit={handleSearchSubmit}>
        <div className={styles.searchInputWrapper}>
          <svg
            className={styles.searchIcon}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search traders, assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button type="button" className={styles.filterButton} aria-label="Filters">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </button>
      </form>

      {/* Sellers / Buyers Toggle */}
      <div className={styles.toggleTabs}>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "sellers" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("sellers")}
        >
          Sellers
        </button>
        <button
          type="button"
          className={`${styles.toggleTab} ${activeTab === "buyers" ? styles.toggleTabActive : ""}`}
          onClick={() => setActiveTab("buyers")}
        >
          Buyers
        </button>
      </div>

      {/* Refresh Control */}
      {activeTab === "sellers" && !listingsLoading && (
        <button type="button" className={styles.refreshControl} onClick={handleRefresh} disabled={refreshing}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={refreshing ? styles.spinning : ""}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {refreshing ? "Refreshing..." : `${listingsTotal} seller${listingsTotal !== 1 ? "s" : ""} found`}
        </button>
      )}

      {/* Content */}
      {activeTab === "sellers" ? (
        <>
          {listingsLoading ? (
            <div className={styles.skeletonCardList}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonCardHeader}>
                    <div className={styles.skeletonAvatar} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
                      <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                    </div>
                  </div>
                  <div className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
                  <div className={styles.skeletonPills}>
                    <div className={styles.skeletonPill} />
                    <div className={styles.skeletonPill} />
                    <div className={styles.skeletonPill} />
                  </div>
                  <div className={styles.skeletonButton} />
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>No sellers found nearby</h3>
              <p className={styles.emptySubtitle}>
                Try adjusting your filters or check back later
              </p>
            </div>
          ) : (
            <div className={styles.listingCardList}>
              {listings.map((listing) => (
                <div key={listing.id} className={styles.listingCard}>
                  <div className={styles.listingCardHeader}>
                    <div className={styles.sellerAvatar}>
                      {listing.seller?.profilePhoto ? (
                        <img
                          src={listing.seller.profilePhoto}
                          alt={listing.seller.username}
                          className={styles.sellerAvatarImg}
                        />
                      ) : (
                        <span className={styles.sellerAvatarInitials}>
                          {getSellerInitials(listing)}
                        </span>
                      )}
                    </div>
                    <div className={styles.sellerInfo}>
                      <span className={styles.sellerName}>
                        {listing.seller?.username || "Seller"}
                      </span>
                      <div className={styles.listingMeta}>
                        <span className={`${styles.assetBadge} ${listing.asset === "USDC" ? styles.assetBadgeUsdc : styles.assetBadgeSol}`}>
                          {listing.asset}
                        </span>
                        <span className={`${styles.tradeTypeBadge} ${listing.tradeType === "IN_PERSON" ? styles.tradeTypeInPerson : listing.tradeType === "REMOTE" ? styles.tradeTypeRemote : styles.tradeTypeBoth}`}>
                          {TRADE_TYPE_LABEL[listing.tradeType] || listing.tradeType}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.listingPriceRow}>
                    <span className={styles.listingPrice}>{formatPrice(listing)}</span>
                    <span className={styles.listingRange}>
                      ${listing.minAmount.toLocaleString()} - ${listing.maxAmount.toLocaleString()}
                    </span>
                  </div>

                  <div className={styles.listingPayments}>
                    {listing.paymentMethods.map((pm) => (
                      <span key={pm} className={styles.paymentChip}>
                        {PAYMENT_LABEL[pm] || pm}
                      </span>
                    ))}
                  </div>

                  <div className={styles.listingFooter}>
                    <span className={styles.liquidityText}>
                      <span className={styles.liquidityDot} />
                      {listing.availableLiquidity.toFixed(listing.asset === "USDC" ? 2 : 4)} {listing.asset} available
                    </span>
                    <Link href={`/trade/${listing.id}`} className={styles.tradeButton}>
                      Trade
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>No buy requests yet</h3>
          <p className={styles.emptySubtitle}>
            Buy requests from nearby traders will appear here
          </p>
        </div>
      )}
    </div>
  );
}

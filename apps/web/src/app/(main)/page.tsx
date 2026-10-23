"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
    rating?: number;
    totalTrades?: number;
  };
  asset: "USDC" | "SOL";
  price?: number;
  priceValue?: number;
  priceType: string;
  marketPercentage: number | null;
  minAmount: number;
  maxAmount: number;
  paymentMethods: string[];
  tradeType: string;
  availableLiquidity: number;
  isActive: boolean;
  distance?: number | null;
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
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const highlightId = searchParams.get("highlight");
  const [activeTab, setActiveTab] = useState<"sellers" | "buyers">(
    tabParam === "buyers" ? "buyers" : "sellers"
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightId);

  // Sync tab + highlight when URL params change (e.g. from notification click)
  useEffect(() => {
    if (tabParam === "buyers") setActiveTab("buyers");
    if (highlightId) setHighlightedId(highlightId);
  }, [tabParam, highlightId]);
  const [searchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const [listings, setListings] = useState<ListingItem[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [radiusLabel, setRadiusLabel] = useState<string | null>(null);
  const [nextRadius, setNextRadius] = useState<number | null>(null);
  const [expandingSearch, setExpandingSearch] = useState(false);

  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  // Fetch market prices on mount
  useEffect(() => {
    api.prices.getAll().then(setMarketPrices).catch(() => {});
  }, []);

  // Buy requests state
  const [buyRequests, setBuyRequests] = useState<any[]>([]);
  const [buyRequestsLoading, setBuyRequestsLoading] = useState(true);
  const [brAsset, setBrAsset] = useState<string>("USDC");
  const [brAmount, setBrAmount] = useState("");
  const [brPayment, setBrPayment] = useState<string>("BANK_TRANSFER");
  const [brSubmitting, setBrSubmitting] = useState(false);
  const [sellModal, setSellModal] = useState<any | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [sellTradeType, setSellTradeType] = useState("REMOTE");
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [myBuyRequests, setMyBuyRequests] = useState<any[]>([]);
  const [brPosted, setBrPosted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  const kycStatus = user?.kycStatus || "UNVERIFIED";
  const hasLocation = !!(user?.latitude && user?.longitude);
  const showLocationBanner = !hasLocation;

  // Silently refresh location on mount using Permissions API (only if already granted)
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state !== "granted") return;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          if (
            user?.latitude &&
            user?.longitude &&
            Math.abs(user.latitude - latitude) < 0.001 &&
            Math.abs(user.longitude - longitude) < 0.001
          ) {
            return;
          }
          try {
            const updatedUser = await api.users.updateProfile({ latitude, longitude });
            updateUser(updatedUser);
          } catch {
            // silently fail
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchListings = useCallback(async (radius?: number) => {
    const isExpanding = radius !== undefined;
    if (isExpanding) {
      setExpandingSearch(true);
    } else {
      setListingsLoading(true);
    }

    const minDelay = isExpanding ? 800 : 1800;
    const start = Date.now();

    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (user?.id) params.excludeSellerId = user.id;
      if (user?.latitude && user?.longitude) {
        params.latitude = String(user.latitude);
        params.longitude = String(user.longitude);
      }
      if (selectedAsset) params.asset = selectedAsset;
      if (amount) {
        params.minAmount = amount;
        params.maxAmount = amount;
      }
      if (radius !== undefined) {
        params.radius = String(radius);
      }
      const data = await api.listings.getAll(params);

      // Wait for minimum animation time
      const elapsed = Date.now() - start;
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }

      setListings(data.items || data.listings || []);
      setListingsTotal(data.total || 0);
      setRadiusLabel(data.radiusLabel ?? null);
      setNextRadius(data.nextRadius ?? null);
    } catch {
      setListings([]);
    } finally {
      setListingsLoading(false);
      setExpandingSearch(false);
      setRefreshing(false);
    }
  }, [searchQuery, user?.id, user?.latitude, user?.longitude, selectedAsset, amount]);

  useEffect(() => {
    if (activeTab === "sellers") {
      fetchListings();
    }
  }, [activeTab, fetchListings]);

  // Fetch buy requests when Buyers tab is active
  const fetchBuyRequests = useCallback(async (silent = false) => {
    if (!silent) setBuyRequestsLoading(true);
    const start = Date.now();
    try {
      const params: Record<string, string> = {};
      if (user?.latitude && user?.longitude) {
        params.latitude = String(user.latitude);
        params.longitude = String(user.longitude);
      }
      const [feedData, myData] = await Promise.all([
        api.buyRequests.getAll(params),
        api.buyRequests.getMine(),
      ]);
      if (!silent) {
        const elapsed = Date.now() - start;
        if (elapsed < 1200) await new Promise((r) => setTimeout(r, 1200 - elapsed));
      }
      setBuyRequests(feedData.items || []);
      // Only show active ones
      const myActive = (Array.isArray(myData) ? myData : []).filter(
        (br: any) => br.isActive && new Date(br.expiresAt) > new Date()
      );
      setMyBuyRequests(myActive);
    } catch {
      setBuyRequests([]);
    } finally {
      if (!silent) setBuyRequestsLoading(false);
    }
  }, [user?.latitude, user?.longitude]);

  useEffect(() => {
    if (activeTab === "buyers") {
      fetchBuyRequests();
    }
  }, [activeTab, fetchBuyRequests]);

  async function handlePostBuyRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!brAmount || !user?.latitude || !user?.longitude) return;
    setBrSubmitting(true);
    setApiError("");
    try {
      await api.buyRequests.create({
        asset: brAsset,
        amount: parseFloat(brAmount),
        paymentMethod: brPayment,
        latitude: user.latitude,
        longitude: user.longitude,
      });
      setBrAmount("");
      setBrPosted(true);
      setTimeout(() => setBrPosted(false), 3000);
      fetchBuyRequests(true);
    } catch (err: any) {
      setApiError(err instanceof Error ? err.message : "Failed to post buy request");
    } finally {
      setBrSubmitting(false);
    }
  }

  async function handleSellToBuyer() {
    if (!sellModal || !sellPrice) return;
    setSellSubmitting(true);
    setApiError("");
    try {
      await api.offers.create({
        buyRequestId: sellModal.id,
        price: parseFloat(sellPrice),
        tradeType: sellTradeType,
      });
      setSellPrice("");
      setApiError("");
      setOfferSent(true);
    } catch (err: any) {
      setApiError(err instanceof Error ? err.message : "Failed to send offer");
    } finally {
      setSellSubmitting(false);
    }
  }

  // Scroll to highlighted buy request
  useEffect(() => {
    if (highlightedId && !buyRequestsLoading && buyRequests.length > 0) {
      const el = document.getElementById(`br-${highlightedId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const timer = setTimeout(() => setHighlightedId(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightedId, buyRequestsLoading, buyRequests.length]);

  // Refresh kycStatus from server on mount
  useEffect(() => {
    api.kyc.getStatus().then((data) => {
      if (data.kycStatus !== user?.kycStatus) {
        updateUser({ kycStatus: data.kycStatus as import("@merlink/types").KycStatus });
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnableLocation = useCallback(async () => {
    setLocationLoading(true);
    setApiError("");

    try {
      let latitude: number;
      let longitude: number;

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          }
        );
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch {
        // Fallback: IP-based geolocation
        const geo = await fetch("http://ip-api.com/json/").then((r) => r.json());
        latitude = geo.lat;
        longitude = geo.lon;
      }

      const updatedUser = await api.users.updateProfile({
        latitude,
        longitude,
      });
      updateUser(updatedUser);
    } catch (err: any) {
      setApiError(
        err instanceof Error ? err.message : "Failed to update location"
      );
    } finally {
      setLocationLoading(false);
    }
  }, [updateUser]);

  function handleRefresh() {
    setRefreshing(true);
    fetchListings();
  }

  function handleExpandSearch() {
    if (nextRadius !== null) {
      fetchListings(nextRadius);
    }
  }

  function handleAmountSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchListings();
  }

  function calcPrice(asset: string, priceType: string, priceValue: number): number {
    const mRate = marketPrices[asset] || 0;
    if (priceType === "MARKET_PLUS" && mRate > 0) return mRate * (1 + priceValue / 100);
    if (priceType === "MARKET_MINUS" && mRate > 0) return mRate * (1 - priceValue / 100);
    return priceValue;
  }

  function formatPriceJsx(listing: ListingItem) {
    const pv = listing.priceValue ?? listing.price ?? 0;
    const pt = (listing as any).priceType || "FIXED";
    const final$ = calcPrice(listing.asset, pt, pv);
    const isMarket = pt === "MARKET_PLUS" || pt === "MARKET_MINUS";

    if (isMarket && final$ > pv) {
      return (
        <span>
          ${final$.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span style={{ fontSize: 11, fontWeight: 600, color: pt === "MARKET_PLUS" ? "#16C784" : "#FF453A", marginLeft: 4 }}>
            {pt === "MARKET_PLUS" ? `+${pv}%` : `-${pv}%`}
          </span>
        </span>
      );
    }
    return <span>${final$.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }

  function formatDistance(distance: number | null | undefined) {
    if (distance === null || distance === undefined) return null;
    if (distance < 1) return `${Math.round(distance * 1000)}m away`;
    return `${distance.toFixed(1)}km away`;
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

      {(kycStatus === "REJECTED" || kycStatus === "PERMANENTLY_REJECTED") && (
        <div className={`${styles.kycBanner} ${styles.kycBannerRejected}`}>
          <div className={styles.kycBannerContent}>
            <div className={`${styles.kycBannerIcon} ${styles.kycBannerIconRejected}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className={styles.kycBannerText}>
              <p className={styles.kycBannerTitle}>
                {kycStatus === "PERMANENTLY_REJECTED" ? "KYC verification unavailable" : "KYC verification failed"}
              </p>
              <p className={styles.kycBannerSubtitle}>
                {kycStatus === "PERMANENTLY_REJECTED" ? "Contact support to appeal" : "Tap to retry your verification"}
              </p>
            </div>
            {kycStatus === "REJECTED" ? (
              <Link href="/kyc" className={`${styles.kycBannerButton} ${styles.kycBannerButtonRejected}`}>
                Retry
              </Link>
            ) : (
              <Link href="/kyc" className={`${styles.kycBannerButton} ${styles.kycBannerButtonRejected}`}>
                Details
              </Link>
            )}
          </div>
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

      {/* Asset Filter Pills */}
      <div className={styles.assetPills}>
        {[null, "SOL", "USDC", "USDT", "ETH", "BTC"].map((asset) => (
          <button
            key={asset ?? "all"}
            type="button"
            className={`${styles.assetPill} ${selectedAsset === asset ? styles.assetPillActive : ""}`}
            onClick={() => setSelectedAsset(asset)}
          >
            {asset ?? "All"}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <form className={styles.searchBar} onSubmit={handleAmountSubmit}>
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
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <input
            type="number"
            className={styles.searchInput}
            placeholder="Amount you want to trade..."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="any"
          />
          {amount && (
            <button
              type="button"
              className={styles.clearAmount}
              onClick={() => setAmount("")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
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
          {buyRequests.length > 0 && activeTab !== "buyers" && (
            <span className={styles.tabBadge}>{buyRequests.length}</span>
          )}
        </button>
      </div>

      {/* Radius Pill + Refresh Row */}
      {activeTab === "sellers" && !listingsLoading && (
        <div className={styles.refreshRow}>
          {radiusLabel && (
            <span className={styles.radiusPill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {radiusLabel}
            </span>
          )}
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
            {refreshing ? "Refreshing..." : `${listingsTotal} seller${listingsTotal !== 1 ? "s" : ""}`}
          </button>
          {hasLocation && (
            <button
              type="button"
              className={styles.refreshControl}
              onClick={handleEnableLocation}
              disabled={locationLoading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLoading ? "Updating..." : "Update"}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === "sellers" ? (
        <>
          {listingsLoading ? (
            <div className={styles.discoveryLoader}>
              <div className={styles.loaderVisual}>
                <div className={styles.loaderRipple} />
                <div className={styles.loaderRipple} />
                <div className={styles.loaderRipple} />
                <div className={styles.loaderOrbit}>
                  <div className={styles.loaderDot} />
                  <div className={styles.loaderDot} />
                  <div className={styles.loaderDot} />
                </div>
              </div>
              <span className={styles.loaderText}>Discovering traders nearby</span>
              <span className={styles.loaderSubtext}>Scanning your area...</span>
            </div>
          ) : listings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>
                Can&apos;t find traders nearby
              </h3>
              <p className={styles.emptySubtitle}>
                {nextRadius === null
                  ? "No traders found anywhere. Check back later!"
                  : nextRadius === 500
                    ? "No one within 100 km. Try expanding to your city."
                    : nextRadius === 2000
                      ? "No one in your city. Try expanding to your country."
                      : nextRadius === 0
                        ? "No one in your country. Try searching globally."
                        : "Try expanding your search area."}
              </p>
              {nextRadius !== null && (
                <button
                  type="button"
                  className={styles.expandButton}
                  onClick={handleExpandSearch}
                  disabled={expandingSearch}
                >
                  {expandingSearch ? (
                    <>
                      <div className={styles.expandSpinner} />
                      Searching...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                      {nextRadius === 500 ? "Expand to City" : nextRadius === 2000 ? "Expand to Country" : nextRadius === 0 ? "Expand Global" : `Expand to ${nextRadius} km`}
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <>
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
                        <div className={styles.sellerNameRow}>
                          <a href={`/trader/${listing.seller?.id}`} className={styles.sellerName} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", color: "inherit" }}>
                            {listing.seller?.username || "Seller"}
                          </a>
                          {listing.seller?.rating !== undefined && listing.seller.rating > 0 && (
                            <span className={styles.sellerRating}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF9F0A" stroke="none">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                              {listing.seller.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className={styles.listingMeta}>
                          <span className={`${styles.assetBadge} ${listing.asset === "USDC" ? styles.assetBadgeUsdc : listing.asset === "ETH" ? styles.assetBadgeUsdc : styles.assetBadgeSol}`}>
                            {listing.asset}
                          </span>
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: (listing as any).chain === "ethereum" ? "rgba(98,126,234,0.1)" : (listing as any).chain === "bitcoin" ? "rgba(247,147,26,0.1)" : "rgba(153,69,255,0.1)", color: (listing as any).chain === "ethereum" ? "#627EEA" : (listing as any).chain === "bitcoin" ? "#F7931A" : "#9945FF", fontWeight: 700 }}>
                            {(listing as any).chain === "ethereum" ? "ETH" : (listing as any).chain === "bitcoin" ? "BTC" : "SOL"}
                          </span>
                          <span className={`${styles.tradeTypeBadge} ${listing.tradeType === "IN_PERSON" ? styles.tradeTypeInPerson : listing.tradeType === "REMOTE" ? styles.tradeTypeRemote : styles.tradeTypeBoth}`}>
                            {TRADE_TYPE_LABEL[listing.tradeType] || listing.tradeType}
                          </span>
                          {listing.distance !== null && listing.distance !== undefined && (
                            <span className={styles.distanceBadge}>
                              {formatDistance(listing.distance)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.listingPriceRow}>
                      <span className={styles.listingPrice}>{formatPriceJsx(listing)}</span>
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
                        {listing.availableLiquidity >= 1 ? listing.availableLiquidity.toFixed(2) : listing.availableLiquidity.toFixed(listing.asset === "USDC" ? 2 : 6)} {listing.asset} available
                      </span>
                      <Link href={`/listing/${listing.id}`} className={styles.tradeButton}>
                        Trade
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Expand search after results */}
              {nextRadius !== null && (
                <div className={styles.expandAfterResults}>
                  <button
                    type="button"
                    className={styles.expandButtonOutline}
                    onClick={handleExpandSearch}
                    disabled={expandingSearch}
                  >
                    {expandingSearch ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinning}>
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        Searching wider...
                      </>
                    ) : (
                      <>
                        Search wider &mdash; {nextRadius === 500 ? "City" : nextRadius === 2000 ? "Country" : nextRadius === 0 ? "Global" : `${nextRadius} km`}
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Post Buy Request Form */}
          <form className={styles.brForm} onSubmit={handlePostBuyRequest}>
            <p className={styles.brFormTitle}>I want to buy</p>
            <div className={styles.brFormRow}>
              <div className={styles.brAssetPills}>
                {["USDC", "SOL", "ETH", "BTC"].map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`${styles.assetPill} ${brAsset === a ? styles.assetPillActive : ""}`}
                    onClick={() => setBrAsset(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.brFormRow}>
              <input
                type="number"
                className={styles.brInput}
                placeholder="Amount"
                value={brAmount}
                onChange={(e) => setBrAmount(e.target.value)}
                min="0"
                step="any"
                required
              />
              <select
                className={styles.brSelect}
                value={brPayment}
                onChange={(e) => setBrPayment(e.target.value)}
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="WISE">Wise</option>
                <option value="REVOLUT">Revolut</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="PAYPAL">PayPal</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <button
              type="submit"
              className={styles.brSubmitButton}
              disabled={brSubmitting || !brAmount || !hasLocation}
            >
              {brSubmitting ? "Posting..." : "Post Buy Request"}
            </button>
            {!hasLocation && (
              <p className={styles.brHint}>Enable location to post a buy request</p>
            )}
            {brPosted && (
              <div className={styles.brSuccess}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Buy request posted! Nearby sellers will be notified.
              </div>
            )}
          </form>

          {/* Your Active Requests */}
          {myBuyRequests.length > 0 && (
            <div className={styles.myRequestsSection}>
              <h4 className={styles.myRequestsTitle}>Your Active Requests</h4>
              {myBuyRequests.map((br: any) => {
                const expiresIn = Math.max(0, Math.floor((new Date(br.expiresAt).getTime() - Date.now()) / 60000));
                return (
                  <a key={br.id} href={`/buy-request/${br.id}`} className={styles.myRequestCard}>
                    <div className={styles.myRequestInfo}>
                      <span className={styles.myRequestAmount}>{br.amount} {br.asset}</span>
                      <span className={styles.myRequestMeta}>
                        {PAYMENT_LABEL[br.paymentMethod] || br.paymentMethod} &middot; {expiresIn}m left
                      </span>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                );
              })}
            </div>
          )}

          {/* Buy Requests Feed */}
          {buyRequestsLoading ? (
            <div className={styles.discoveryLoader}>
              <div className={styles.loaderVisual}>
                <div className={styles.loaderRipple} />
                <div className={styles.loaderRipple} />
                <div className={styles.loaderRipple} />
                <div className={styles.loaderOrbit}>
                  <div className={styles.loaderDot} />
                  <div className={styles.loaderDot} />
                  <div className={styles.loaderDot} />
                </div>
              </div>
              <span className={styles.loaderText}>Finding buy requests</span>
              <span className={styles.loaderSubtext}>Scanning your area...</span>
            </div>
          ) : buyRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>No buy requests nearby</h3>
              <p className={styles.emptySubtitle}>
                Be the first to post one, or check back later
              </p>
            </div>
          ) : (
            <div className={styles.listingCardList}>
              {buyRequests.map((br: any) => (
                <div
                  key={br.id}
                  id={`br-${br.id}`}
                  className={`${styles.listingCard} ${highlightedId === br.id ? styles.cardHighlighted : ""}`}
                >
                  <div className={styles.listingCardHeader}>
                    <div className={styles.sellerAvatar}>
                      {br.buyer?.profilePhoto ? (
                        <img src={br.buyer.profilePhoto} alt={br.buyer.username} className={styles.sellerAvatarImg} />
                      ) : (
                        <span className={styles.sellerAvatarInitials}>
                          {(br.buyer?.username || "U").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className={styles.sellerInfo}>
                      <div className={styles.sellerNameRow}>
                        <span className={styles.sellerName}>{br.buyer?.username || "Buyer"}</span>
                        {br.buyer?.rating > 0 && (
                          <span className={styles.sellerRating}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FF9F0A" stroke="none">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                            {br.buyer.rating.toFixed(1)}
                          </span>
                        )}
                        {br.buyer?.totalTrades > 0 && (
                          <span className={styles.distanceBadge}>{br.buyer.totalTrades} trades</span>
                        )}
                      </div>
                      <div className={styles.listingMeta}>
                        <span className={`${styles.assetBadge} ${br.asset === "USDC" ? styles.assetBadgeUsdc : styles.assetBadgeSol}`}>
                          {br.asset}
                        </span>
                        <span className={styles.distanceBadge}>
                          {PAYMENT_LABEL[br.paymentMethod] || br.paymentMethod}
                        </span>
                        {br.distance !== null && br.distance !== undefined && (
                          <span className={styles.distanceBadge}>{formatDistance(br.distance)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.listingPriceRow}>
                    <span className={styles.listingPrice}>
                      {br.amount} {br.asset}
                    </span>
                    <span className={styles.brExpiry}>
                      Expires {new Date(br.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <div className={styles.listingFooter}>
                    <span className={styles.liquidityText}>wants to buy</span>
                    {br.buyerId !== user?.id ? (
                      <button
                        type="button"
                        className={styles.tradeButton}
                        onClick={() => { setSellModal(br); setSellPrice(""); }}
                      >
                        Sell to them
                      </button>
                    ) : (
                      <span className={styles.brYourRequest}>Your request</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sell Modal */}
          {sellModal && (
            <div className={styles.modalOverlay} onClick={() => { setSellModal(null); setOfferSent(false); }}>
              <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                {offerSent ? (
                  <>
                    <div className={styles.offerSentIcon}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16C784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3 className={styles.modalTitle} style={{ textAlign: "center" }}>Offer Sent!</h3>
                    <p className={styles.modalSubtitle} style={{ textAlign: "center" }}>
                      Waiting for {sellModal.buyer?.username || "the buyer"} to accept your offer of ${sellPrice || "—"}/{sellModal.asset}
                    </p>
                    <button
                      type="button"
                      className={styles.brSubmitButton}
                      onClick={() => { setSellModal(null); setOfferSent(false); }}
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className={styles.modalTitle}>Send Offer</h3>
                    <p className={styles.modalSubtitle}>
                      {sellModal.buyer?.username} wants to buy {sellModal.amount} {sellModal.asset}
                    </p>

                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>Your price per {sellModal.asset}</label>
                      <input
                        type="number"
                        className={styles.modalPriceInput}
                        placeholder="e.g. 1.02"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                        min="0"
                        step="any"
                        required
                      />
                    </div>

                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>Trade type</label>
                      <div className={styles.brAssetPills}>
                        {["REMOTE", "IN_PERSON"].map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`${styles.assetPill} ${sellTradeType === t ? styles.assetPillActive : ""}`}
                            onClick={() => setSellTradeType(t)}
                          >
                            {t === "REMOTE" ? "Remote" : "In Person"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.modalDetail}>
                      <span>Amount</span>
                      <span>{sellModal.amount} {sellModal.asset}</span>
                    </div>
                    <div className={styles.modalDetail}>
                      <span>Payment</span>
                      <span>{PAYMENT_LABEL[sellModal.paymentMethod] || sellModal.paymentMethod}</span>
                    </div>
                    {sellPrice && (
                      <div className={styles.modalDetail}>
                        <span>Total</span>
                        <span className={styles.modalTotal}>${(sellModal.amount * parseFloat(sellPrice)).toFixed(2)}</span>
                      </div>
                    )}

                    <div className={styles.modalActions}>
                      <button type="button" className={styles.modalCancel} onClick={() => setSellModal(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.tradeButton}
                        onClick={handleSellToBuyer}
                        disabled={sellSubmitting || !sellPrice}
                      >
                        {sellSubmitting ? "Sending..." : "Send Offer"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

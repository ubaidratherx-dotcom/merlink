"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import styles from "./page.module.css";

const PAYMENT_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer", CASH: "Cash", WISE: "Wise",
  REVOLUT: "Revolut", MOBILE_MONEY: "Mobile Money", PAYPAL: "PayPal", OTHER: "Other",
};

function getCompletionColor(pct: number) {
  if (pct >= 80) return "#16C784";
  if (pct >= 50) return "#FF9F0A";
  return "#FF453A";
}

export default function TraderProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listingPage, setListingPage] = useState(0);
  const [listingChainFilter, setListingChainFilter] = useState<"all" | "solana" | "ethereum" | "bitcoin">("all");
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<"all" | "best" | "worst">("all");
  const LISTINGS_PER_PAGE = 3;
  const REVIEWS_PER_PAGE = 3;

  useEffect(() => {
    api.users.getPublicProfile(id)
      .then(setProfile)
      .catch((err: any) => setError(err.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCenter}>
          <div className={styles.shimmer} style={{ width: 72, height: 72, borderRadius: "50%" }} />
          <div className={styles.shimmer} style={{ width: 120, height: 18, borderRadius: 6 }} />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>{error || "Profile not found"}</div>
        <button className={styles.backBtn} onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  const isOwn = user?.id === profile.id;
  const completionPct = profile.totalTrades > 0 ? Math.round((1 - profile.disputeRatio) * 100) : 0;

  return (
    <div className={styles.container}>
      {/* Profile Header */}
      <div className={styles.profileHeader}>
        <button className={styles.backArrow} onClick={() => router.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className={styles.avatar}>
          {profile.profilePhoto ? (
            <img src={profile.profilePhoto} alt={profile.username} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarFallback}>
              {profile.username?.[0]?.toUpperCase() || "?"}
            </div>
          )}
        </div>

        <h1 className={styles.name}>{profile.username}</h1>

        {profile.bio && <p className={styles.bio}>{profile.bio}</p>}

        <div className={styles.tags}>
          {profile.kycStatus === "VERIFIED" && (
            <span className={styles.tagVerified}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Verified
            </span>
          )}
          {profile.sellerMode && <span className={styles.tagSeller}>Seller</span>}
          <span className={styles.tagMuted}>{profile.accountAge}d active</span>
        </div>

        {isOwn && <Link href="/profile/edit" className={styles.editBtn}>Edit Profile</Link>}
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{profile.totalTrades}</span>
          <span className={styles.statLabel}>Trades</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statNum}>
            {profile.averageRating > 0 ? (
              <>{profile.averageRating} <span style={{ color: "#FFD700", fontSize: 14 }}>★</span></>
            ) : "—"}
          </span>
          <span className={styles.statLabel}>Rating</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          {profile.totalTrades > 0 ? (
            <>
              <span className={styles.statNum} style={{ color: getCompletionColor(completionPct) }}>{completionPct}%</span>
              <div className={styles.miniBar}>
                <div className={styles.miniBarFill} style={{ width: `${completionPct}%`, background: getCompletionColor(completionPct) }} />
              </div>
            </>
          ) : (
            <span className={styles.statNum}>—</span>
          )}
          <span className={styles.statLabel}>Completion</span>
        </div>
      </div>

      {/* Listings */}
      {profile.listings && profile.listings.length > 0 && (() => {
        const allListings: any[] = profile.listings;
        const filtered = listingChainFilter === "all" ? allListings : allListings.filter((l: any) => l.chain === listingChainFilter);
        const totalPages = Math.ceil(filtered.length / LISTINGS_PER_PAGE);
        const safePage = Math.min(listingPage, Math.max(totalPages - 1, 0));
        const pageListings = filtered.slice(safePage * LISTINGS_PER_PAGE, (safePage + 1) * LISTINGS_PER_PAGE);

        const chains = [...new Set(allListings.map((l: any) => l.chain))] as string[];

        return (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Listings</h2>
              <span className={styles.count}>{filtered.length}</span>
            </div>

            {/* Chain filter */}
            {chains.length > 1 && (
              <div className={styles.filterRow}>
                <button className={`${styles.filterChip} ${listingChainFilter === "all" ? styles.filterActive : ""}`} onClick={() => { setListingChainFilter("all"); setListingPage(0); }}>All</button>
                {chains.includes("solana") && <button className={`${styles.filterChip} ${listingChainFilter === "solana" ? styles.filterActive : ""}`} onClick={() => { setListingChainFilter("solana"); setListingPage(0); }} style={listingChainFilter === "solana" ? {} : { borderColor: "rgba(153,69,255,0.2)", color: "#9945FF" }}>SOL</button>}
                {chains.includes("ethereum") && <button className={`${styles.filterChip} ${listingChainFilter === "ethereum" ? styles.filterActive : ""}`} onClick={() => { setListingChainFilter("ethereum"); setListingPage(0); }} style={listingChainFilter === "ethereum" ? {} : { borderColor: "rgba(98,126,234,0.2)", color: "#627EEA" }}>ETH</button>}
                {chains.includes("bitcoin") && <button className={`${styles.filterChip} ${listingChainFilter === "bitcoin" ? styles.filterActive : ""}`} onClick={() => { setListingChainFilter("bitcoin"); setListingPage(0); }} style={listingChainFilter === "bitcoin" ? {} : { borderColor: "rgba(247,147,26,0.2)", color: "#F7931A" }}>BTC</button>}
              </div>
            )}

            {pageListings.length > 0 ? pageListings.map((listing: any) => {
              const chainLabel = listing.chain === "ethereum" ? "ETH" : listing.chain === "bitcoin" ? "BTC" : "SOL";
              const chainColor = listing.chain === "ethereum" ? "#627EEA" : listing.chain === "bitcoin" ? "#F7931A" : "#9945FF";
              return (
                <div key={listing.id} className={styles.listingCard}>
                  <div className={styles.listingTop}>
                    <div className={styles.listingInfo}>
                      <span className={styles.listingAsset}>{listing.asset}</span>
                      <span className={styles.chainPill} style={{ color: chainColor, background: `${chainColor}15` }}>{chainLabel}</span>
                    </div>
                    <span className={styles.listingPrice}>
                      {listing.priceType === "FIXED"
                        ? `$${listing.priceValue.toLocaleString()}`
                        : <>Mkt <span style={{ color: listing.priceType === "MARKET_PLUS" ? "#16C784" : "#FF453A" }}>{listing.priceType === "MARKET_PLUS" ? "+" : "−"}{listing.priceValue}%</span></>
                      }
                    </span>
                  </div>
                  <div className={styles.listingMid}>
                    <span className={styles.listingRange}>{listing.minAmount} – {listing.maxAmount} {listing.asset}</span>
                    <span className={styles.listingLiquidity}>
                      <span className={styles.dot} />
                      {listing.availableLiquidity >= 1 ? listing.availableLiquidity.toFixed(2) : listing.availableLiquidity.toFixed(6)} available
                    </span>
                  </div>
                  <div className={styles.listingBottom}>
                    <div className={styles.payments}>
                      {listing.paymentMethods.map((pm: string) => (
                        <span key={pm} className={styles.paymentChip}>{PAYMENT_LABEL[pm] || pm}</span>
                      ))}
                    </div>
                    {!isOwn && (
                      <Link href={`/listing/${listing.id}`} className={styles.tradeBtn}>Trade</Link>
                    )}
                  </div>
                </div>
              );
            }) : (
              <p className={styles.emptyText}>No listings for this chain</p>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button className={styles.pageArrow} onClick={() => setListingPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div className={styles.dots}>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} className={`${styles.dot2} ${i === safePage ? styles.dotActive : ""}`} onClick={() => setListingPage(i)} />
                  ))}
                </div>
                <button className={styles.pageArrow} onClick={() => setListingPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Reviews */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Reviews</h2>
          {profile.reviews?.length > 0 && <span className={styles.count}>{profile.reviews.length}</span>}
        </div>
        {profile.reviews && profile.reviews.length > 0 ? (() => {
          // AI-style summary
          const allReviews: any[] = profile.reviews;
          const avg = profile.averageRating;
          const total = allReviews.length;
          const fiveCount = allReviews.filter((r: any) => r.rating === 5).length;
          const lowCount = allReviews.filter((r: any) => r.rating <= 2).length;
          const comments = allReviews.filter((r: any) => r.comment).map((r: any) => r.comment);
          const hasSpeed = comments.some((c: string) => /fast|quick|instant|smooth/i.test(c));
          const hasSlow = comments.some((c: string) => /slow|wait|delay/i.test(c));
          const hasReliable = comments.some((c: string) => /reliable|professional|solid|great|best|perfect/i.test(c));

          let summary = "";
          if (avg >= 4.5) {
            summary = `Highly rated trader with ${avg}/5 average across ${total} reviews.`;
            if (hasSpeed) summary += " Frequently praised for fast transactions.";
            if (hasReliable) summary += " Known for being reliable and professional.";
          } else if (avg >= 3.5) {
            summary = `Well-rated trader averaging ${avg}/5 from ${total} reviews.`;
            if (hasSlow) summary += " Some traders noted occasional delays.";
            if (hasReliable) summary += " Generally considered reliable.";
          } else {
            summary = `Mixed reviews averaging ${avg}/5 from ${total} reviews.`;
            if (hasSlow) summary += " Multiple reports of slow response times.";
          }
          if (fiveCount > total * 0.6) summary += ` ${Math.round(fiveCount / total * 100)}% gave 5 stars.`;
          if (lowCount > 0 && avg >= 3.5) summary += ` ${lowCount} review${lowCount > 1 ? "s" : ""} below 3 stars.`;

          // Filter
          const filtered = reviewFilter === "best"
            ? [...allReviews].sort((a: any, b: any) => b.rating - a.rating)
            : reviewFilter === "worst"
              ? [...allReviews].sort((a: any, b: any) => a.rating - b.rating)
              : allReviews;

          const totalPages = Math.ceil(filtered.length / REVIEWS_PER_PAGE);
          const safePage = Math.min(reviewPage, totalPages - 1);
          const pageReviews = filtered.slice(safePage * REVIEWS_PER_PAGE, (safePage + 1) * REVIEWS_PER_PAGE);
          return (
            <>
              {/* AI Summary */}
              <div className={styles.summaryCard}>
                <div className={styles.summaryIcon}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <p className={styles.summaryText}>{summary}</p>
              </div>

              {/* Filter */}
              <div className={styles.filterRow}>
                {(["all", "best", "worst"] as const).map(f => (
                  <button
                    key={f}
                    className={`${styles.filterChip} ${reviewFilter === f ? styles.filterActive : ""}`}
                    onClick={() => { setReviewFilter(f); setReviewPage(0); }}
                  >
                    {f === "all" ? "All" : f === "best" ? "Highest" : "Lowest"}
                  </button>
                ))}
              </div>

              {pageReviews.map((review: any) => (
                <div key={review.id} className={styles.reviewCard}>
                  <div className={styles.reviewTop}>
                    <div className={styles.reviewUser}>
                      {review.reviewer.profilePhoto ? (
                        <img src={review.reviewer.profilePhoto} alt="" className={styles.reviewAvatar} />
                      ) : (
                        <div className={styles.reviewAvatarFallback}>{review.reviewer.username?.[0]?.toUpperCase()}</div>
                      )}
                      <div>
                        <span className={styles.reviewName}>{review.reviewer.username}</span>
                        <span className={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={styles.reviewStars}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{ color: i < review.rating ? "#FFD700" : "var(--border)" }}>★</span>
                      ))}
                    </span>
                  </div>
                  {review.comment && <p className={styles.reviewComment}>{review.comment}</p>}
                </div>
              ))}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageArrow}
                    onClick={() => setReviewPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <div className={styles.dots}>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        className={`${styles.dot2} ${i === safePage ? styles.dotActive : ""}`}
                        onClick={() => setReviewPage(i)}
                      />
                    ))}
                  </div>
                  <button
                    className={styles.pageArrow}
                    onClick={() => setReviewPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage === totalPages - 1}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              )}
            </>
          );
        })() : (
          <p className={styles.emptyText}>No reviews yet</p>
        )}
      </div>
    </div>
  );
}

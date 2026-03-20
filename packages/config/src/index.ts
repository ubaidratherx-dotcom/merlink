/**
 * @merlink/config - Shared configuration constants for the Merlink platform
 */

// ---------------------------------------------------------------------------
// Solana Configuration
// ---------------------------------------------------------------------------

export const SOLANA_NETWORKS = {
  mainnet: "mainnet-beta",
  devnet: "devnet",
  testnet: "testnet",
} as const;

export type SolanaNetwork = (typeof SOLANA_NETWORKS)[keyof typeof SOLANA_NETWORKS];

export const SOLANA_RPC_URLS: Record<SolanaNetwork, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export const SOLANA_CONFIG = {
  defaultNetwork: SOLANA_NETWORKS.devnet,
  confirmationCommitment: "confirmed" as const,
  escrowProgramId: "", // To be set after deployment
} as const;

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

export const API_ENDPOINTS = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    verifyOtp: "/auth/verify-otp",
    refreshToken: "/auth/refresh-token",
    logout: "/auth/logout",
  },
  users: {
    profile: "/users/profile",
    updateProfile: "/users/profile",
    getById: (id: string) => `/users/${id}`,
  },
  listings: {
    base: "/listings",
    getById: (id: string) => `/listings/${id}`,
    search: "/listings/search",
  },
  buyRequests: {
    base: "/buy-requests",
    getById: (id: string) => `/buy-requests/${id}`,
  },
  trades: {
    base: "/trades",
    getById: (id: string) => `/trades/${id}`,
    updateStatus: (id: string) => `/trades/${id}/status`,
    myTrades: "/trades/me",
  },
  chat: {
    messages: (tradeId: string) => `/trades/${tradeId}/messages`,
    send: (tradeId: string) => `/trades/${tradeId}/messages`,
  },
  reviews: {
    base: "/reviews",
    getForUser: (userId: string) => `/users/${userId}/reviews`,
  },
} as const;

// ---------------------------------------------------------------------------
// App Constants
// ---------------------------------------------------------------------------

export const TRADE_LIMITS = {
  /** Minimum trade amount in USD */
  minAmountUsd: 5,
  /** Maximum trade amount in USD */
  maxAmountUsd: 10_000,
  /** Maximum distance in km for local trades */
  maxDistanceKm: 100,
  /** Protocol fee percentage (0.5%) */
  protocolFeePercent: 0.5,
} as const;

export const TIMEOUTS = {
  /** Time the buyer has to fund escrow after trade is initiated (ms) */
  escrowFundingMs: 30 * 60 * 1000, // 30 minutes
  /** Time the seller has to confirm meetup (ms) */
  meetupConfirmationMs: 60 * 60 * 1000, // 1 hour
  /** Time allowed for dispute resolution (ms) */
  disputeResolutionMs: 72 * 60 * 60 * 1000, // 72 hours
  /** API request timeout (ms) */
  apiRequestMs: 15_000, // 15 seconds
  /** WebSocket reconnect delay (ms) */
  wsReconnectMs: 3_000, // 3 seconds
  /** OTP code expiry (ms) */
  otpExpiryMs: 10 * 60 * 1000, // 10 minutes
} as const;

export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

// ---------------------------------------------------------------------------
// Validation Rules
// ---------------------------------------------------------------------------

export const VALIDATION = {
  username: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-z0-9_-]+$/,
    patternMessage: "Username may only contain lowercase letters, numbers, underscores, and hyphens",
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: true,
  },
  email: {
    maxLength: 255,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  listing: {
    titleMinLength: 5,
    titleMaxLength: 100,
    descriptionMinLength: 10,
    descriptionMaxLength: 2000,
    maxImages: 5,
  },
  chat: {
    maxMessageLength: 1000,
  },
  review: {
    minRating: 1,
    maxRating: 5,
    commentMaxLength: 500,
  },
} as const;

// ─── User & Auth ─────────────────────────────────────────────
export type AccountStatus = "UNVERIFIED" | "PHONE_VERIFIED";

export type KycStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export type AuthProvider = "phone" | "email";

export interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  profilePhoto: string | null;
  authProvider: AuthProvider;
  accountStatus: AccountStatus;
  kycStatus: KycStatus;
  walletAddress: string | null;
  walletVerified: boolean;
  sellerMode: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  profilePhoto: string | null;
  kycStatus: KycStatus;
  totalTrades: number;
  averageRating: number;
  accountAge: number; // days
  disputeRatio: number;
}

// ─── Auth ────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  username: string;
  phone?: string;
  email?: string;
  password?: string;
}

export interface LoginInput {
  phone?: string;
  email?: string;
  password?: string;
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
}

// ─── Wallet ──────────────────────────────────────────────────
export type SupportedWallet = "phantom" | "solflare" | "backpack";

export type SupportedAsset = "USDC" | "SOL";

export interface WalletVerifyInput {
  walletAddress: string;
  signature: string;
  message: string;
}

// ─── Listings ────────────────────────────────────────────────
export type TradeTypeAllowed = "IN_PERSON" | "REMOTE" | "BOTH";

export type PaymentMethod =
  | "BANK_TRANSFER"
  | "CASH"
  | "WISE"
  | "REVOLUT"
  | "MOBILE_MONEY"
  | "PAYPAL"
  | "OTHER";

export type PriceType = "FIXED" | "MARKET_PLUS" | "MARKET_MINUS";

export interface Listing {
  id: string;
  sellerId: string;
  asset: SupportedAsset;
  priceType: PriceType;
  priceValue: number;
  minAmount: number;
  maxAmount: number;
  paymentMethods: PaymentMethod[];
  tradeType: TradeTypeAllowed;
  availableLiquidity: number | null;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingInput {
  asset: SupportedAsset;
  priceType: PriceType;
  priceValue: number;
  minAmount: number;
  maxAmount: number;
  paymentMethods: PaymentMethod[];
  tradeType: TradeTypeAllowed;
}

// ─── Buyer Requests ──────────────────────────────────────────
export interface BuyRequest {
  id: string;
  buyerId: string;
  asset: SupportedAsset;
  amount: number;
  paymentMethod: PaymentMethod;
  latitude: number;
  longitude: number;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateBuyRequestInput {
  asset: SupportedAsset;
  amount: number;
  paymentMethod: PaymentMethod;
}

// ─── Trades ──────────────────────────────────────────────────
export type TradeStatus =
  | "CREATED"
  | "ESCROW_LOCKED"
  | "PAYMENT_PENDING"
  | "PAYMENT_MARKED_SENT"
  | "RELEASE_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED"
  | "RESOLVED";

export type TradeType = "IN_PERSON" | "REMOTE";

export interface Trade {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string | null;
  buyRequestId: string | null;
  asset: SupportedAsset;
  amount: number;
  price: number;
  paymentMethod: PaymentMethod;
  tradeType: TradeType;
  status: TradeStatus;
  escrowAddress: string | null;
  escrowTxSignature: string | null;
  releaseTxSignature: string | null;
  protocolFee: number;
  paymentDeadline: Date | null;
  confirmationDeadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTradeInput {
  listingId?: string;
  buyRequestId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  tradeType: TradeType;
}

// ─── Trade State Log ─────────────────────────────────────────
export interface TradeStateLog {
  id: string;
  tradeId: string;
  fromStatus: TradeStatus | null;
  toStatus: TradeStatus;
  changedBy: string;
  reason: string | null;
  createdAt: Date;
}

// ─── Chat ────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  tradeId: string;
  senderId: string;
  content: string;
  isBlocked: boolean;
  blockReason: string | null;
  createdAt: Date;
}

export interface SendMessageInput {
  tradeId: string;
  content: string;
}

// ─── Reviews / Reputation ────────────────────────────────────
export interface Review {
  id: string;
  tradeId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number; // 1-5
  comment: string | null;
  createdAt: Date;
}

export interface CreateReviewInput {
  tradeId: string;
  rating: number;
  comment?: string;
}

// ─── Video Verification (In-Person) ─────────────────────────
export interface VideoVerification {
  id: string;
  tradeId: string;
  userId: string;
  videoUrl: string;
  gpsLatitude: number;
  gpsLongitude: number;
  deviceId: string;
  createdAt: Date;
}

// ─── Dispute ─────────────────────────────────────────────────
export type DisputeResolution = "RELEASE_TO_BUYER" | "REFUND_TO_SELLER";

export interface Dispute {
  id: string;
  tradeId: string;
  initiatedBy: string;
  reason: string;
  resolution: DisputeResolution | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

// ─── Discovery ───────────────────────────────────────────────
export interface DiscoveryFilters {
  asset?: SupportedAsset;
  paymentMethod?: PaymentMethod;
  tradeType?: TradeTypeAllowed;
  minAmount?: number;
  maxAmount?: number;
  radiusKm?: number;
  latitude: number;
  longitude: number;
}

export interface DiscoveryRanking {
  distanceWeight: number;     // 0.4
  reputationWeight: number;   // 0.3
  tradeCountWeight: number;   // 0.2
  priceWeight: number;        // 0.1
}

// ─── API Response Wrappers ───────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Constants ───────────────────────────────────────────────
export const PROTOCOL_FEE_PERCENTAGE = 0.005; // 0.5%
export const DEFAULT_SEARCH_RADIUS_KM = 100;
export const BUY_REQUEST_EXPIRY_MINUTES = 30;
export const PAYMENT_DEADLINE_HOURS = 6;
export const SELLER_CONFIRMATION_HOURS = 1;

export const DISCOVERY_WEIGHTS: DiscoveryRanking = {
  distanceWeight: 0.4,
  reputationWeight: 0.3,
  tradeCountWeight: 0.2,
  priceWeight: 0.1,
};

export const SUPPORTED_ASSETS: SupportedAsset[] = ["USDC", "SOL"];

export const PAYMENT_METHODS: PaymentMethod[] = [
  "BANK_TRANSFER",
  "CASH",
  "WISE",
  "REVOLUT",
  "MOBILE_MONEY",
  "PAYPAL",
  "OTHER",
];

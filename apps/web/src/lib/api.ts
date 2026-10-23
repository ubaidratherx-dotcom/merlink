import type {
  ApiResponse,
  AuthTokens,
  RegisterInput,
  OtpVerifyInput,
  User,
} from "@merlink/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("merlink_tokens");
    if (!raw) return null;
    const tokens: AuthTokens = JSON.parse(raw);
    return tokens.accessToken;
  } catch {
    return null;
  }
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("merlink_tokens");
    if (!raw) return null;
    const tokens: AuthTokens = JSON.parse(raw);
    return tokens.refreshToken;
  } catch {
    return null;
  }
}

function saveTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("merlink_tokens", JSON.stringify(tokens));
}

function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("merlink_tokens");
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const json: ApiResponse<AuthTokens> = await res.json();
    saveTokens(json.data);
    return json.data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const accessToken = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // If 401, try refreshing the token and retry once
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    const message = errorBody?.error?.message || errorBody?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export const api = {
  auth: {
    register: (data: RegisterInput) =>
      fetchApi<{ user: User; tokens?: AuthTokens }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    loginEmail: (data: { email: string; password: string }) =>
      fetchApi<{ user: User; tokens: AuthTokens }>("/auth/login/email", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    loginPhone: (data: { phone: string }) =>
      fetchApi<{ message: string }>("/auth/login/phone", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    sendOtp: (phone: string) =>
      fetchApi<{ message: string }>("/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ phone }),
      }),

    verifyOtp: (phone: string, code: string) =>
      fetchApi<{ user: User; tokens: AuthTokens }>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code } satisfies OtpVerifyInput),
      }),

    refreshToken: (refreshToken: string) =>
      fetchApi<AuthTokens>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),

    logout: (refreshToken: string) =>
      fetchApi<{ message: string }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),

    me: () => fetchApi<User>("/auth/me"),

    forgotPassword: (email: string) =>
      fetchApi<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, password: string) =>
      fetchApi<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      }),

    changePassword: (currentPassword: string, newPassword: string) =>
      fetchApi<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),

    getSessions: () => fetchApi<any[]>("/auth/sessions"),

    revokeSession: (sessionId: string) =>
      fetchApi<any>(`/auth/sessions/${sessionId}`, { method: "DELETE" }),

    setup2FA: () => fetchApi<{ secret: string; qrCodeDataUrl: string }>("/auth/2fa/setup", { method: "POST" }),

    verify2FA: (code: string) =>
      fetchApi<any>("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),

    disable2FA: (code: string) =>
      fetchApi<any>("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),

    loginVerify2FA: (userId: string, code: string) =>
      fetchApi<any>("/auth/2fa/login-verify", { method: "POST", body: JSON.stringify({ userId, code }) }),
  },

  email: {
    sendVerification: () =>
      fetchApi<{ message: string }>("/email/send-verification", { method: "POST" }),
    verify: (token: string) =>
      fetchApi<{ message: string }>(`/email/verify?token=${token}`),
  },

  users: {
    updateProfile: (data: { username?: string; latitude?: number; longitude?: number; bio?: string; profilePhoto?: string }) =>
      fetchApi<User>("/users/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getPublicProfile: (userId: string) =>
      fetchApi<any>(`/users/${userId}`),
  },

  upload: {
    profilePhoto: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/upload/profile-photo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      return json.data;
    },
  },

  wallet: {
    verify: (data: { walletAddress: string; signature: string; message: string }) =>
      fetchApi<User>("/wallet/verify", { method: "POST", body: JSON.stringify(data) }),
    disconnect: () =>
      fetchApi<User>("/wallet/disconnect", { method: "POST" }),
    getBalance: () =>
      fetchApi<{ sol: number; usdc: number }>("/wallet/balance"),
    // ETH wallet
    ethVerify: (data: { walletAddress: string; signature: string; message: string }) =>
      fetchApi<User>("/wallet/eth/verify", { method: "POST", body: JSON.stringify(data) }),
    ethDisconnect: () =>
      fetchApi<User>("/wallet/eth/disconnect", { method: "POST" }),
    ethGetBalance: () =>
      fetchApi<{ eth: number; usdc: number; usdt: number }>("/wallet/eth/balance"),
    // BTC wallet
    btcConnect: (data: { btcAddress: string; btcPubkey: string }) =>
      fetchApi<any>("/wallet/btc/connect", { method: "POST", body: JSON.stringify(data) }),
    btcDisconnect: () =>
      fetchApi<any>("/wallet/btc/disconnect", { method: "POST" }),
    btcGetBalance: () =>
      fetchApi<{ btc: number }>("/wallet/btc/balance"),
  },

  kyc: {
    startKyc: (data?: { firstName?: string; lastName?: string }) =>
      fetchApi<{ accessToken: string; applicantId: string }>("/kyc/start", {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    getStatus: () =>
      fetchApi<{
        kycStatus: string;
        applicantId: string | null;
        softRejections: number;
        hardRejections: number;
        reviewComment: string | null;
        canRetry: boolean;
      }>("/kyc/status"),
  },

  listings: {
    enableSellerMode: () =>
      fetchApi<User>("/listings/seller-mode", { method: "POST" }),
    create: (data: {
      asset: string;
      priceType: string;
      priceValue: number;
      minAmount: number;
      maxAmount: number;
      paymentMethods: string[];
      tradeType: string;
    }) =>
      fetchApi("/listings", { method: "POST", body: JSON.stringify(data) }),
    update: (listingId: string, data: Record<string, unknown>) =>
      fetchApi(`/listings/${listingId}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (listingId: string) =>
      fetchApi(`/listings/${listingId}`, { method: "DELETE" }),
    getMine: () =>
      fetchApi<any[]>("/listings/mine"),
    getById: (listingId: string) =>
      fetchApi(`/listings/${listingId}`),
    getAll: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchApi<{ items: any[]; listings?: any[]; total: number; radius?: number | null; radiusLabel?: string | null; nextRadius?: number | null }>(`/listings${query}`);
    },
    refreshLiquidity: (listingId: string) =>
      fetchApi(`/listings/${listingId}/refresh`, { method: "POST" }),
  },

  chat: {
    getConversations: () => fetchApi<any[]>("/chat/conversations"),
    markRead: (tradeId: string) =>
      fetchApi<any>(`/chat/${tradeId}/read`, { method: "POST" }),
    getMessages: (tradeId: string, cursor?: string) => {
      const query = cursor ? `?cursor=${cursor}` : "";
      return fetchApi<{ messages: any[]; hasMore: boolean }>(
        `/chat/${tradeId}/messages${query}`
      );
    },
    sendMessage: (tradeId: string, content: string) =>
      fetchApi<any>(`/chat/${tradeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },

  buyRequests: {
    create: (data: { asset: string; amount: number; paymentMethod: string; latitude: number; longitude: number }) =>
      fetchApi<any>("/buy-requests", { method: "POST", body: JSON.stringify(data) }),

    getAll: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchApi<{ items: any[]; total: number; radius?: number | null; radiusLabel?: string | null; nextRadius?: number | null }>(`/buy-requests${query}`);
    },

    getMine: () => fetchApi<any[]>("/buy-requests/mine"),

    getById: (id: string) => fetchApi<any>(`/buy-requests/${id}`),

    cancel: (id: string) => fetchApi<any>(`/buy-requests/${id}`, { method: "DELETE" }),
  },

  btc: {
    createEscrow: (data: { tradeId: string; sellerBtcPubkey: string; buyerBtcPubkey: string }) =>
      fetchApi<any>("/btc/escrow/create", { method: "POST", body: JSON.stringify(data) }),
    checkDeposit: (address: string) =>
      fetchApi<any>(`/btc/escrow/deposit/${address}`),
    buildRelease: (data: { tradeId: string; recipientAddress: string }) =>
      fetchApi<any>("/btc/escrow/build-release", { method: "POST", body: JSON.stringify(data) }),
    coSignBroadcast: (tradeId: string, psbtBase64: string) =>
      fetchApi<any>("/btc/escrow/cosign-broadcast", { method: "POST", body: JSON.stringify({ tradeId, psbtBase64 }) }),
    buildCancel: (tradeId: string) =>
      fetchApi<any>("/btc/escrow/build-cancel", { method: "POST", body: JSON.stringify({ tradeId }) }),
    buildDisputeClaim: (tradeId: string) =>
      fetchApi<any>("/btc/escrow/build-dispute-claim", { method: "POST", body: JSON.stringify({ tradeId }) }),
    coSignCancel: (tradeId: string, psbtBase64: string) =>
      fetchApi<any>("/btc/escrow/cosign-cancel", { method: "POST", body: JSON.stringify({ tradeId, psbtBase64 }) }),
    getBalance: (address: string) =>
      fetchApi<{ btc: number }>(`/btc/balance/${address}`),
    getAdminPubkey: () =>
      fetchApi<{ pubkey: string }>("/btc/admin-pubkey"),
  },

  prices: {
    getAll: () => fetchApi<Record<string, number>>("/prices"),
  },

  notifications: {
    getRecent: () => fetchApi<any[]>("/notifications"),
    getUnreadCount: () => fetchApi<{ count: number }>("/notifications/unread-count"),
    markRead: () => fetchApi<any>("/notifications/mark-read", { method: "POST" }),
  },

  disputes: {
    getByTrade: (tradeId: string) => fetchApi<any>(`/disputes/trade/${tradeId}`),

    uploadScreenshot: async (disputeId: string, file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      const accessToken = localStorage.getItem("merlink_tokens")
        ? JSON.parse(localStorage.getItem("merlink_tokens")!).accessToken
        : null;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"}/disputes/${disputeId}/evidence`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Upload failed" } }));
        throw new Error(err?.error?.message || "Upload failed");
      }
      return res.json().then((d) => d.data);
    },

    uploadText: (disputeId: string, content: string) =>
      fetchApi<any>(`/disputes/${disputeId}/evidence/text`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),

    // Admin
    sendAdminMessage: (tradeId: string, content: string) =>
      fetchApi<any>(`/disputes/admin/${tradeId}/chat`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),

    getOpen: () => fetchApi<any[]>("/disputes/admin/open"),

    resolve: (disputeId: string, resolution: "RELEASE_TO_BUYER" | "REFUND_TO_SELLER", note?: string) =>
      fetchApi<any>(`/disputes/admin/${disputeId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, note }),
      }),
  },

  reviews: {
    create: (data: { tradeId: string; rating: number; comment?: string }) =>
      fetchApi<any>("/reviews", { method: "POST", body: JSON.stringify(data) }),
    getForTrade: (tradeId: string) =>
      fetchApi<any[]>(`/reviews/trade/${tradeId}`),
    hasReviewed: (tradeId: string) =>
      fetchApi<{ reviewed: boolean }>(`/reviews/check/${tradeId}`),
  },

  offers: {
    create: (data: { buyRequestId: string; price: number; tradeType: string }) =>
      fetchApi<any>("/offers", { method: "POST", body: JSON.stringify(data) }),

    getForBuyRequest: (buyRequestId: string) =>
      fetchApi<any[]>(`/offers/buy-request/${buyRequestId}`),

    accept: (offerId: string) =>
      fetchApi<any>(`/offers/${offerId}/accept`, { method: "POST" }),

    decline: (offerId: string) =>
      fetchApi<any>(`/offers/${offerId}/decline`, { method: "POST" }),
  },

  trades: {
    create: (data: {
      listingId?: string;
      buyRequestId?: string;
      amount: number;
      paymentMethod: string;
      tradeType: string;
    }) =>
      fetchApi("/trades", { method: "POST", body: JSON.stringify(data) }),

    getPendingCount: () =>
      fetchApi<{ count: number }>("/trades/pending-count"),

    getMine: (params?: { status?: string; page?: string; pageSize?: string }) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetchApi<{ trades: any[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
        `/trades${query}`
      );
    },

    getById: (tradeId: string) => fetchApi<any>(`/trades/${tradeId}`),

    confirmEscrow: (tradeId: string, escrowTxSignature: string) =>
      fetchApi(`/trades/${tradeId}/escrow`, {
        method: "POST",
        body: JSON.stringify({ escrowTxSignature }),
      }),

    markPaymentSent: (tradeId: string) =>
      fetchApi(`/trades/${tradeId}/payment-sent`, { method: "POST" }),

    confirmRelease: (tradeId: string) =>
      fetchApi(`/trades/${tradeId}/release`, { method: "POST" }),

    cancel: (tradeId: string) =>
      fetchApi(`/trades/${tradeId}/cancel`, { method: "POST" }),

    openDispute: (tradeId: string, reason: string) =>
      fetchApi(`/trades/${tradeId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  },
};

export { saveTokens, clearTokens, getRefreshToken };

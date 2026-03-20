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
        body: JSON.stringify({ token, password }),
      }),
  },

  email: {
    sendVerification: () =>
      fetchApi<{ message: string }>("/email/send-verification", { method: "POST" }),
    verify: (token: string) =>
      fetchApi<{ message: string }>(`/email/verify?token=${token}`),
  },

  users: {
    updateProfile: (data: { username?: string; latitude?: number; longitude?: number }) =>
      fetchApi<User>("/users/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
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
  },

  kyc: {
    startKyc: (data?: { firstName?: string; lastName?: string }) =>
      fetchApi<{ accessToken: string; applicantId: string }>("/kyc/start", {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    getStatus: () =>
      fetchApi<{ kycStatus: string; applicantId?: string }>("/kyc/status"),
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
      return fetchApi<{ listings: any[]; total: number }>(`/listings${query}`);
    },
    refreshLiquidity: (listingId: string) =>
      fetchApi(`/listings/${listingId}/refresh`, { method: "POST" }),
  },
};

export { saveTokens, clearTokens, getRefreshToken };

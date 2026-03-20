/**
 * @merlink/api - Platform-agnostic API client for the Merlink platform
 *
 * Uses the Fetch API so it works on web, React Native, and Node.js.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private onUnauthorized: (() => void | Promise<void>) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // ---- Token management ---------------------------------------------------

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  clearTokens(): void {
    this.accessToken = null;
  }

  setOnUnauthorized(callback: () => void | Promise<void>): void {
    this.onUnauthorized = callback;
  }

  // ---- Core HTTP methods --------------------------------------------------

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  // ---- Internal request handler -------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options?.params);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: options?.signal,
    };

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (response.status === 401 && this.onUnauthorized) {
      await this.onUnauthorized();
      throw {
        status: 401,
        message: "Unauthorized",
      } as ApiError;
    }

    if (!response.ok) {
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = (await response.json()) as Record<string, unknown>;
      } catch {
        // Response body may not be JSON
      }

      throw {
        status: response.status,
        message: (errorBody.message as string) || response.statusText,
        errors: errorBody.errors as Record<string, string[]> | undefined,
      } as ApiError;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: undefined as T, status: response.status };
    }

    const data = (await response.json()) as Record<string, unknown> & T;

    return {
      data: data as T,
      status: response.status,
      message: data.message as string | undefined,
    };
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  // =========================================================================
  // Typed endpoint methods
  // =========================================================================

  // ---- Auth ---------------------------------------------------------------

  auth = {
    register: (data: {
      email: string;
      username: string;
      password: string;
    }) => this.post<{ userId: string }>("/auth/register", data),

    login: (data: {
      email: string;
      password: string;
    }) => this.post<{ accessToken: string; refreshToken: string }>("/auth/login", data),

    verifyOtp: (data: {
      email: string;
      code: string;
    }) => this.post<{ verified: boolean }>("/auth/verify-otp", data),

    refreshToken: (data: {
      refreshToken: string;
    }) => this.post<{ accessToken: string; refreshToken: string }>("/auth/refresh-token", data),

    logout: () => this.post<void>("/auth/logout"),
  };

  // ---- Users --------------------------------------------------------------

  users = {
    getProfile: () => this.get<{
      id: string;
      email: string;
      username: string;
      avatarUrl?: string;
      rating: number;
      tradeCount: number;
      createdAt: string;
    }>("/users/profile"),

    updateProfile: (data: {
      username?: string;
      avatarUrl?: string;
    }) => this.put<{ id: string; username: string; avatarUrl?: string }>("/users/profile", data),
  };

  // ---- Listings -----------------------------------------------------------

  listings = {
    create: (data: {
      title: string;
      description: string;
      price: number;
      currency: string;
      category: string;
      latitude: number;
      longitude: number;
      images?: string[];
    }) => this.post<{ id: string }>("/listings", data),

    getAll: (params?: {
      page?: number;
      pageSize?: number;
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
    }) => this.get<PaginatedResponse<unknown>>("/listings", { params: params as Record<string, string | number | boolean | undefined> }),

    getById: (id: string) => this.get<unknown>(`/listings/${id}`),

    update: (id: string, data: {
      title?: string;
      description?: string;
      price?: number;
      currency?: string;
      category?: string;
      images?: string[];
    }) => this.put<unknown>(`/listings/${id}`, data),

    delete: (id: string) => this.delete<void>(`/listings/${id}`),
  };

  // ---- Buy Requests -------------------------------------------------------

  buyRequests = {
    create: (data: {
      listingId: string;
      message?: string;
      offeredPrice?: number;
    }) => this.post<{ id: string }>("/buy-requests", data),

    getAll: (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
    }) => this.get<PaginatedResponse<unknown>>("/buy-requests", { params: params as Record<string, string | number | boolean | undefined> }),

    getById: (id: string) => this.get<unknown>(`/buy-requests/${id}`),
  };

  // ---- Trades -------------------------------------------------------------

  trades = {
    create: (data: {
      buyRequestId: string;
    }) => this.post<{ id: string; escrowAddress: string }>("/trades", data),

    getById: (id: string) => this.get<unknown>(`/trades/${id}`),

    updateStatus: (id: string, data: {
      status: string;
      transactionSignature?: string;
    }) => this.patch<unknown>(`/trades/${id}/status`, data),

    getMyTrades: (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      role?: "buyer" | "seller";
    }) => this.get<PaginatedResponse<unknown>>("/trades/me", { params: params as Record<string, string | number | boolean | undefined> }),
  };

  // ---- Chat ---------------------------------------------------------------

  chat = {
    getMessages: (tradeId: string, params?: {
      page?: number;
      pageSize?: number;
      before?: string;
    }) => this.get<PaginatedResponse<unknown>>(`/trades/${tradeId}/messages`, { params: params as Record<string, string | number | boolean | undefined> }),

    sendMessage: (tradeId: string, data: {
      content: string;
    }) => this.post<{ id: string; createdAt: string }>(`/trades/${tradeId}/messages`, data),
  };

  // ---- Reviews ------------------------------------------------------------

  reviews = {
    create: (data: {
      tradeId: string;
      rating: number;
      comment?: string;
    }) => this.post<{ id: string }>("/reviews", data),

    getForUser: (userId: string, params?: {
      page?: number;
      pageSize?: number;
    }) => this.get<PaginatedResponse<unknown>>(`/users/${userId}/reviews`, { params: params as Record<string, string | number | boolean | undefined> }),
  };
}

// Default export for convenience
export default ApiClient;

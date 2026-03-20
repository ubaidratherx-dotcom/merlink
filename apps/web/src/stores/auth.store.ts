import { create } from "zustand";
import type { User, AuthTokens } from "@merlink/types";
import { api, saveTokens, clearTokens } from "@/lib/api";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  phone: string | null;

  setUser: (user: User) => void;
  updateUser: (data: Partial<User>) => void;
  setTokens: (tokens: AuthTokens) => void;
  setPhone: (phone: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: true,
  phone: null,

  setUser: (user) => set({ user, isAuthenticated: true }),

  updateUser: (data) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...data } });
    }
  },

  setTokens: (tokens) => {
    saveTokens(tokens);
    set({ tokens });
  },

  setPhone: (phone) => set({ phone }),

  logout: () => {
    const { tokens } = get();
    if (tokens?.refreshToken) {
      api.auth.logout(tokens.refreshToken).catch(() => {});
    }
    clearTokens();
    set({ user: null, tokens: null, isAuthenticated: false, phone: null });
  },

  setLoading: (isLoading) => set({ isLoading }),

  initialize: async () => {
    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    const raw = localStorage.getItem("merlink_tokens");
    if (!raw) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const tokens: AuthTokens = JSON.parse(raw);
      set({ tokens });

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const user = await api.auth.me();
      clearTimeout(timeout);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      console.error("[auth] initialize failed:", err);
      clearTokens();
      set({ tokens: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

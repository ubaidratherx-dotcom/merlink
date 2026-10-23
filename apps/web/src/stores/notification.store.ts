import { create } from "zustand";

const STORAGE_KEY = "merlink_notifications";

export interface Notification {
  id: string;
  type: "buy-request" | "trade-update" | "info";
  title: string;
  subtitle?: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  hydrated: boolean;
  hydrate: () => void;
  addNotification: (n: Omit<Notification, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export function isNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("merlink_notif_enabled") !== "off";
}

function persist(notifications: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {}
}

function load(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Notification[];
    // Prune notifications older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed.filter((n) => n.createdAt > cutoff);
  } catch {
    return [];
  }
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  hydrated: false,

  hydrate: async () => {
    // Load from localStorage first
    const local = load();

    // Then fetch from server (catches missed notifications while offline)
    try {
      const { api } = await import("@/lib/api");
      const server: any[] = await api.notifications.getRecent();
      if (Array.isArray(server) && server.length > 0) {
        // Convert server notifications to local format
        const serverNotifs: Notification[] = server.map((n: any) => ({
          id: n.id,
          type: n.type as any,
          title: n.title,
          subtitle: n.subtitle,
          link: n.link,
          read: n.read,
          createdAt: new Date(n.createdAt).getTime(),
        }));

        // Merge: server notifications + local ones (dedup by title + similar time)
        const merged = [...serverNotifs];
        for (const l of local) {
          const isDup = merged.some(
            (m) => m.title === l.title && Math.abs(m.createdAt - l.createdAt) < 60000
          );
          if (!isDup) merged.push(l);
        }
        merged.sort((a, b) => b.createdAt - a.createdAt);
        const trimmed = merged.slice(0, 50);
        const unreadCount = trimmed.filter((n) => !n.read).length;
        persist(trimmed);
        set({ notifications: trimmed, unreadCount, hydrated: true });
        return;
      }
    } catch {
      // Server fetch failed, use local only
    }

    const unreadCount = local.filter((n) => !n.read).length;
    set({ notifications: local, unreadCount, hydrated: true });
  },

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: Math.random().toString(36).slice(2),
      read: false,
      createdAt: Date.now(),
    };
    set((state) => {
      // Deduplicate: skip if same title was added in last 5 seconds
      const recent = state.notifications[0];
      if (recent && recent.title === notification.title && Date.now() - recent.createdAt < 5000) {
        return state;
      }
      const updated = [notification, ...state.notifications].slice(0, 50);
      persist(updated);
      return {
        notifications: updated,
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  markAllRead: () => {
    set((state) => {
      const updated = state.notifications.map((n) => ({ ...n, read: true }));
      persist(updated);
      return { notifications: updated, unreadCount: 0 };
    });
    // Sync with server
    import("@/lib/api").then(({ api }) => api.notifications.markRead()).catch(() => {});
  },

  clearAll: () => {
    persist([]);
    set({ notifications: [], unreadCount: 0 });
  },
}));

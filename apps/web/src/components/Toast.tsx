"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./Toast.module.css";

interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "error";
  link?: string;
}

let addToastFn: ((toast: Omit<ToastItem, "id">) => void) | null = null;
let lastToastMessage = "";
let lastToastTime = 0;

export function showToast(message: string, type: "info" | "success" | "error" = "info", link?: string) {
  // Deduplicate: skip if same message within 3 seconds
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastTime < 3000) return;
  lastToastMessage = message;
  lastToastTime = now;

  if (addToastFn) {
    addToastFn({ message, type, link });
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
          onClick={() => {
            if (toast.link) window.location.href = toast.link;
            setToasts((prev) => prev.filter((t) => t.id !== toast.id));
          }}
        >
          <span className={styles.message}>{toast.message}</span>
          {toast.link && <span className={styles.arrow}>&#8250;</span>}
        </div>
      ))}
    </div>
  );
}

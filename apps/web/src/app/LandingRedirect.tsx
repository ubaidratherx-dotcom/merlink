"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Signed-in visitors skip the marketing page and land in the app. */
export default function LandingRedirect() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (localStorage.getItem("merlink_tokens")) router.replace("/discover");
    } catch {
      // storage unavailable: stay on the landing page
    }
  }, [router]);
  return null;
}

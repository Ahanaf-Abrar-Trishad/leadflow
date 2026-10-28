"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

/** Refreshes a server-rendered page while something on it is in progress
 * (an active campaign, a running scrape), so counts update without a
 * manual reload. */
export function StatusPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}

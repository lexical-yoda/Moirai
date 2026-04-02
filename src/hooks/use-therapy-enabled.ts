"use client";

import { useState, useEffect } from "react";

// Simple in-memory cache to avoid multiple API calls across components
let cachedValue: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

export function useTherapyEnabled() {
  const [enabled, setEnabled] = useState(cachedValue ?? false);

  useEffect(() => {
    if (cachedValue !== null && Date.now() - cacheTimestamp < CACHE_TTL) {
      setEnabled(cachedValue);
      return;
    }

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const val = d.therapyEnabled || false;
        cachedValue = val;
        cacheTimestamp = Date.now();
        setEnabled(val);
      })
      .catch((err) => console.error("[useTherapyEnabled] Failed to load settings:", err));
  }, []);

  return enabled;
}

/** Call this after saving settings to invalidate the cache */
export function invalidateTherapyCache() {
  cachedValue = null;
  cacheTimestamp = 0;
}

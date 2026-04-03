"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

// Simple in-memory cache with subscriber pattern for cross-component reactivity
let cachedValue: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return cachedValue ?? false;
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

export function useTherapyEnabled() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [loaded, setLoaded] = useState(cachedValue !== null);

  useEffect(() => {
    if (cachedValue !== null && Date.now() - cacheTimestamp < CACHE_TTL) {
      setLoaded(true);
      return;
    }

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const val = d.therapyEnabled || false;
        cachedValue = val;
        cacheTimestamp = Date.now();
        setLoaded(true);
        notifyListeners();
      })
      .catch((err) => console.error("[useTherapyEnabled] Failed to load settings:", err));
  }, []);

  return loaded ? value : false;
}

/** Call this after saving settings to update all components immediately */
export function invalidateTherapyCache() {
  cachedValue = null;
  cacheTimestamp = 0;
  // Re-fetch immediately so all components update
  fetch("/api/settings")
    .then((r) => r.json())
    .then((d) => {
      cachedValue = d.therapyEnabled || false;
      cacheTimestamp = Date.now();
      notifyListeners();
    })
    .catch(() => {});
}

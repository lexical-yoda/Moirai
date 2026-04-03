/**
 * Simple in-memory rate limiter for auth and expensive endpoints.
 * Tracks attempts per key with a sliding window.
 * Bounded to MAX_STORE_SIZE entries to prevent memory exhaustion.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_STORE_SIZE = 10_000;
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 15 * 60 * 1000, // 15 minutes
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // Evict oldest entries if store is full
    if (store.size >= MAX_STORE_SIZE) {
      let oldest: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of store) {
        if (v.resetAt < oldestTime) { oldest = k; oldestTime = v.resetAt; }
      }
      if (oldest) store.delete(oldest);
    }
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

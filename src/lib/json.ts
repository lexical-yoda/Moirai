/**
 * Safely parse JSON from the database. Returns fallback on failure.
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    console.error("[JSON] Parse failed:", json?.slice(0, 100), err);
    return fallback;
  }
}

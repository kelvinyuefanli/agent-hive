import { RateLimitError } from "@/lib/utils/errors";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

/**
 * Default rate-limit presets.
 */
export const RATE_LIMIT_DEFAULTS = {
  read: { windowMs: 60_000, maxRequests: 1000 } satisfies RateLimitConfig,
  write: { windowMs: 60_000, maxRequests: 100 } satisfies RateLimitConfig,
} as const;

// In-memory sliding-window store. Keyed by `orgId:endpoint`.
const windows = new Map<string, WindowEntry>();

// Evict stale entries every 5 minutes to prevent unbounded growth
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;
let lastEviction = Date.now();

function evictStaleEntries(): void {
  const now = Date.now();
  if (now - lastEviction < EVICTION_INTERVAL_MS) return;
  lastEviction = now;
  for (const [key, entry] of windows) {
    // Evict entries whose window has expired (default max window is 1h)
    if (now - entry.windowStart > 3_600_000) {
      windows.delete(key);
    }
  }
}

/**
 * Check whether the caller has exceeded their rate limit for the given endpoint.
 * Throws RateLimitError (429) when the limit is exceeded.
 */
export function checkRateLimit(
  orgId: string,
  endpoint: string,
  config?: RateLimitConfig,
): void {
  evictStaleEntries();

  const effectiveConfig = config ?? RATE_LIMIT_DEFAULTS.write;
  const key = `${orgId}:${endpoint}`;
  const now = Date.now();

  let entry = windows.get(key);

  if (!entry || now - entry.windowStart >= effectiveConfig.windowMs) {
    // Start a new window
    entry = { count: 1, windowStart: now };
    windows.set(key, entry);
    return;
  }

  entry.count += 1;

  if (entry.count > effectiveConfig.maxRequests) {
    const retryAfter = Math.ceil(
      (entry.windowStart + effectiveConfig.windowMs - now) / 1000,
    );
    throw new RateLimitError(
      `Rate limit exceeded: ${effectiveConfig.maxRequests} requests per ${effectiveConfig.windowMs / 1000}s`,
      retryAfter,
    );
  }
}

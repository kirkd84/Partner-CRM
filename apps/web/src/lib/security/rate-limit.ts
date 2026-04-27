/**
 * In-memory rate limiter — fixed-window counters keyed by an arbitrary
 * string (IP, IP+username, user ID).
 *
 * Why in-memory:
 *   - SPEC mentions Upstash Redis but it's never been wired (no
 *     UPSTASH_REDIS_* env vars). Rather than ship "rate limiting is
 *     pending" we ship a working in-memory implementation. Single-dyno
 *     it works fine; multi-dyno it under-counts (each dyno tracks
 *     independently) — flag for migration when we scale Railway > 1
 *     instance.
 *
 * Trade-offs vs. a proper distributed limiter:
 *   - Resets on dyno restart (a deploy). An attacker can re-hammer
 *     after each redeploy. Our cap is conservative enough that this
 *     doesn't change the threat model materially.
 *   - Memory bounded by a periodic prune. We hold at most ~10k keys
 *     before eviction, plenty for current scale.
 *
 * When we need distributed:
 *   - Swap the body of `checkLimit` for an Upstash atomic INCR + TTL
 *     using @upstash/ratelimit. The signature stays the same.
 */

interface Bucket {
  count: number;
  /** Wall-clock ms when this bucket resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;
let lastPruneAt = 0;

export interface RateLimitResult {
  /** True if the request is allowed; false if it exceeded the limit. */
  ok: boolean;
  /** Remaining requests in the current window. Negative if rejected. */
  remaining: number;
  /** Wall-clock ms when the window resets. */
  resetAt: number;
}

/**
 * Apply a rate limit. The (key, windowMs, max) triple is stable, so the
 * same key over the same window shares state.
 *
 *   `key` is namespaced by caller convention — e.g. `login:127.0.0.1`,
 *   `export:user_abc`, `lasso:user_abc:market_xyz`. Pick something
 *   that makes attacker iteration expensive.
 *
 *   `windowMs` is the rolling window in ms.
 *
 *   `max` is the request count allowed inside the window.
 */
export function checkLimit(
  key: string,
  windowMs: number,
  max: number,
  now = Date.now(),
): RateLimitResult {
  // Periodic prune so a stream of unique keys doesn't grow the map
  // forever. Cheap because we only sweep when the map is over its cap
  // and at most every 60s.
  if (buckets.size > MAX_KEYS && now - lastPruneAt > 60_000) {
    pruneExpired(now);
    lastPruneAt = now;
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  const remaining = Math.max(0, max - bucket.count);
  return {
    ok: bucket.count <= max,
    remaining,
    resetAt: bucket.resetAt,
  };
}

/** Reset the limiter for a key — used on successful login so the
 * post-login session doesn't share the failed-login bucket. */
export function resetLimit(key: string): void {
  buckets.delete(key);
}

function pruneExpired(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Pull the caller's IP from a Next request. Trusts standard reverse-
 * proxy headers (`x-forwarded-for`, `cf-connecting-ip`) because Railway
 * sits behind one. Falls back to a sentinel so we still rate-limit
 * (just less effectively) when headers are missing.
 */
export function ipFromRequest(req: { headers: Headers }): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // First IP in the list is the originator; the rest are proxy hops.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown-ip';
}

/**
 * 429 response builder — standard X-RateLimit-* headers + Retry-After
 * so well-behaved clients back off correctly.
 */
export function rateLimitResponse(result: RateLimitResult, max: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(retryAfterSec),
      'x-ratelimit-limit': String(max),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
    },
  });
}

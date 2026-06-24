import "server-only";

/**
 * Lightweight fixed-window rate limiter.
 *
 * In-memory and therefore PER-INSTANCE — on serverless (Vercel) each instance
 * keeps its own counters, so this throttles casual bursts/abuse but is not a
 * distributed guarantee. For strict cross-instance limits, back this with a
 * shared store (e.g. Upstash Redis) behind the same `rateLimit` interface.
 * Intended for public, unauthenticated endpoints (e.g. the waitlist form);
 * authenticated app traffic is unaffected unless explicitly wrapped.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Requests left in the current window (>= 0). */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

/** Bound memory: once the map is large, drop entries whose window has expired. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }
  existing.count += 1;
  return {
    ok: existing.count <= opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

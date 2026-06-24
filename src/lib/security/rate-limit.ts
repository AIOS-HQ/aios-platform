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
 *
 * `rateLimitDistributed` (below) is the cross-instance variant: it uses Upstash
 * Redis over its REST API when `UPSTASH_REDIS_REST_URL` / `_TOKEN` are set, and
 * transparently falls back to this in-memory limiter otherwise — so callers get
 * a single async interface that is distributed in production and still throttles
 * locally in dev/preview. It is fail-open: any Redis error or timeout degrades
 * to the in-memory path rather than blocking the request.
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

/**
 * Distributed fixed-window limiter backed by Upstash Redis (REST API).
 *
 * - Uses a `INCR` + `PEXPIRE … NX` pipeline keyed by the floored window start,
 *   so every instance shares one counter per (key, window).
 * - Falls back to the in-memory `rateLimit` when Upstash isn't configured, so
 *   dev/preview and unconfigured deployments stay behavior-neutral (still
 *   throttled per-instance, never hard-dependent on Redis).
 * - Fail-open: a non-OK response, malformed body, network error, or >1s timeout
 *   degrades to the in-memory path. A limiter outage must never take the app
 *   down or lock out legitimate users.
 *
 * Uses only `fetch` + Web APIs, so it is safe in the Edge middleware runtime.
 */
export async function rateLimitDistributed(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return rateLimit(key, opts);

  const now = Date.now();
  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  const resetAt = windowStart + opts.windowMs;
  const redisKey = `rl:${key}:${windowStart}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // INCR returns the new count; PEXPIRE … NX sets the TTL only on the first
      // hit of the window so the window can't be extended by later requests.
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(opts.windowMs + 1000), "NX"],
      ]),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return rateLimit(key, opts);
    const data = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = Number(data?.[0]?.result ?? 0);
    if (!Number.isFinite(count) || count <= 0) return rateLimit(key, opts);
    return {
      ok: count <= opts.limit,
      remaining: Math.max(0, opts.limit - count),
      resetAt,
    };
  } catch {
    return rateLimit(key, opts);
  } finally {
    clearTimeout(timer);
  }
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

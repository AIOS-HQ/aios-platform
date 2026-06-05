import "server-only";

import { aiLimits, shouldRetry, backoffDelayMs } from "./limits";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with timeout + retry/backoff for AI provider calls.
 * - Aborts each attempt after `AI_TIMEOUT_MS` (failure recovery, no hangs).
 * - Retries transient failures (network errors, 429, 5xx) up to `AI_MAX_RETRIES`
 *   with exponential backoff; never retries 4xx (except 429).
 * Throws the last error if all attempts fail (caller handles recovery).
 */
export async function resilientFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const { timeoutMs, maxRetries } = aiLimits();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && shouldRetry(res.status) && attempt < maxRetries) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("resilientFetch: request failed");
}

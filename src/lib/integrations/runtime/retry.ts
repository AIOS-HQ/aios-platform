import { type RetryPolicy, DEFAULT_RETRY_POLICY } from "./types";

/**
 * Universal retry engine. Every capability call runs through this: bounded
 * attempts, exponential backoff with optional jitter, and explicit retryable-
 * error classification (only errors flagged retryable are retried).
 */

export class RetryableError extends Error {
  readonly retryable = true;
  readonly code: string;
  constructor(message: string, code = "retryable") {
    super(message);
    this.name = "RetryableError";
    this.code = code;
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof RetryableError) return true;
  if (err && typeof err === "object" && "retryable" in err) {
    return Boolean((err as { retryable?: unknown }).retryable);
  }
  return false;
}

function delayFor(attempt: number, p: RetryPolicy): number {
  const exp = Math.min(p.maxDelayMs, p.baseDelayMs * 2 ** (attempt - 1));
  return p.jitter ? Math.floor(exp * (0.5 + Math.random() / 2)) : exp;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOutcome<T> {
  value?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Execute `fn` with retry on retryable errors. Never throws — returns a
 * discriminated outcome so callers stay branch-explicit.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy?: Partial<RetryPolicy>,
): Promise<RetryOutcome<T>> {
  const p: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...(policy ?? {}) };
  let lastErr: unknown;
  let attempt = 0;
  while (attempt < p.maxAttempts) {
    attempt += 1;
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt >= p.maxAttempts || !isRetryable(err)) break;
      await sleep(delayFor(attempt, p));
    }
  }
  return { error: lastErr, attempts: attempt };
}

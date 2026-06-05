/**
 * AI provider safeguards — pure + dependency-free so they're unit-testable and
 * usable from the provider HTTP layer. All values are env-overridable with
 * clamped, sane defaults (cost + reliability protection):
 *
 *   AI_TIMEOUT_MS         per-request timeout         (default 30000)
 *   AI_MAX_RETRIES        retries on transient errors (default 2)
 *   AI_MAX_PROMPT_CHARS   input cap (cost protection) (default 8000)
 *   AI_MAX_OUTPUT_TOKENS  output cap (cost protection)(default 1024)
 */
export type AiLimits = {
  timeoutMs: number;
  maxRetries: number;
  maxPromptChars: number;
  maxOutputTokens: number;
};

function clampInt(
  raw: string | undefined,
  def: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Resolve the active limits from env (clamped). Read per-call so tests + env
 * changes take effect without a module reload. */
export function aiLimits(): AiLimits {
  return {
    timeoutMs: clampInt(process.env.AI_TIMEOUT_MS, 30000, 1000, 120000),
    maxRetries: clampInt(process.env.AI_MAX_RETRIES, 2, 0, 5),
    maxPromptChars: clampInt(process.env.AI_MAX_PROMPT_CHARS, 8000, 100, 200000),
    maxOutputTokens: clampInt(process.env.AI_MAX_OUTPUT_TOKENS, 1024, 16, 8192),
  };
}

/** Cost protection: never send more than `max` characters to the provider. */
export function clampPrompt(text: string, max: number): string {
  if (max <= 0) return "";
  return text.length <= max ? text : text.slice(0, max);
}

/** Retry only on rate-limits (429) and server errors (5xx). */
export function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Exponential backoff (ms) for retry attempt 0,1,2 → 300,600,1200… capped. */
export function backoffDelayMs(attempt: number, base = 300, cap = 5000): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}

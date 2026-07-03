/**
 * Shared input length limits (M-2 hardening).
 *
 * Used by client inputs (`maxLength`) AND server actions (authoritative
 * validation) so oversized payloads are rejected even if the client is bypassed.
 */
export const LIMITS = {
  title: 200,
  description: 2000,
  noteContent: 20000,
  brainContent: 20000,
  name: 120,
  tag: 40,
  tagsCount: 12,
  operatorInput: 12000,
} as const;

/** Returns true if any [value, max] pair exceeds its max length. */
export function exceedsLimits(
  pairs: Array<[string | null | undefined, number]>,
): boolean {
  return pairs.some(([value, max]) => (value ? value.length : 0) > max);
}

/**
 * AirBid reserved workforce — a SEPARATE registry, deliberately isolated from
 * the AIOS workforce.
 *
 * AIOS and AirBid are separate companies. These names belong to AirBid and must
 * never be used as AIOS agents. There is NO shared workforce, NO shared
 * organizational memory, and NO shared company brain between AIOS and AirBid.
 * This module exists purely to draw and enforce that boundary in code — AIOS
 * code references AirBid only to BLOCK it, never to integrate with it.
 *
 * Pure + client-safe. No secrets, no DB. AirBid's own operational registry (if/
 * when AirBid is built) lives in AirBid's own separate repository.
 */

export const AIRBID_RESERVED_NAMES = [
  "Nexus",
  "Sentinel",
  "Guardian",
  "Oracle",
  "Compass",
] as const;

export type AirbidReservedName = (typeof AIRBID_RESERVED_NAMES)[number];

/** True if a name belongs to the reserved AirBid workforce (blocked for AIOS). */
export function isReservedAirbidName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return AIRBID_RESERVED_NAMES.some((r) => r.toLowerCase() === n);
}

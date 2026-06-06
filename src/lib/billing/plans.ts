/**
 * Harmony subscription plans + plan gating.
 *
 * Pure, client-safe configuration (no env reads, no secrets) so it can be
 * imported by both Server Components and Client Components. Display copy
 * (names, taglines, feature lists, prices) lives in the localized `pricing`
 * message namespace; this module owns the STRUCTURE: ids, ordering, trial,
 * which Stripe price env var backs each plan, self-serve vs. contact-sales,
 * and how plans map to Harmony hub access.
 */

export type PlanId = "free" | "starter" | "professional" | "business" | "enterprise";

/** A Harmony hub that can be gated behind a plan. */
export type HubKey = "personal" | "business" | "harmony";

export interface PlanDef {
  id: PlanId;
  /** Name of the env var holding this plan's Stripe Price ID (server-side). */
  priceEnvKey: string | null;
  /** Free trial length applied at checkout. 0 = no trial. */
  trialDays: number;
  /** Self-serve via Stripe Checkout. Enterprise is contact-sales. */
  selfServe: boolean;
  /** Whether to highlight this plan as the recommended one. */
  popular: boolean;
}

/** Ordered, lowest → highest. `free` is the implicit default (no subscription). */
export const PLANS: PlanDef[] = [
  { id: "starter", priceEnvKey: "STRIPE_PRICE_STARTER", trialDays: 14, selfServe: true, popular: false },
  { id: "professional", priceEnvKey: "STRIPE_PRICE_PROFESSIONAL", trialDays: 14, selfServe: true, popular: true },
  { id: "business", priceEnvKey: "STRIPE_PRICE_BUSINESS", trialDays: 14, selfServe: true, popular: false },
  { id: "enterprise", priceEnvKey: "STRIPE_PRICE_ENTERPRISE", trialDays: 0, selfServe: false, popular: false },
];

/** Self-serve plan ids a visitor can check out, in display order. */
export const SELF_SERVE_PLAN_IDS: PlanId[] = PLANS.filter((p) => p.selfServe).map((p) => p.id);

/** Rank used for gating comparisons. Higher = more access. */
const RANK: Record<PlanId, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
  enterprise: 4,
};

export function planRank(id: PlanId): number {
  return RANK[id] ?? 0;
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "free" || value === "starter" || value === "professional" || value === "business" || value === "enterprise";
}

export function getPlan(id: PlanId): PlanDef | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Returns true when `plan` is at least the `required` tier. */
export function hasAtLeast(plan: PlanId, required: PlanId): boolean {
  return planRank(plan) >= planRank(required);
}

/**
 * Minimum plan required to access each Harmony hub.
 * Personal Hub ships with the entry plan; Business Hub and the autonomous
 * Harmony Hub progressively require higher tiers.
 */
export const HUB_MIN_PLAN: Record<HubKey, PlanId> = {
  personal: "starter",
  business: "professional",
  harmony: "business",
};

/** Whether `plan` may access the given hub. */
export function canAccessHub(plan: PlanId, hub: HubKey): boolean {
  return hasAtLeast(plan, HUB_MIN_PLAN[hub]);
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/billing/store";
import {
  canAccessHub,
  hasAtLeast,
  type HubKey,
  type PlanId,
} from "@/lib/billing/plans";
import type { Subscription } from "@/lib/billing/types";

/**
 * Subscription reads + Harmony plan gating for the current user.
 * Reads go through the RLS-scoped server client, so a user only ever sees their
 * own subscription row.
 */

/** Stripe statuses that grant plan access. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isActiveStatus(status: string | null | undefined): boolean {
  return Boolean(status && ACTIVE_STATUSES.has(status));
}

export async function getSubscriptionForUser(userId: string): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Table may not exist yet (migration not applied) — degrade gracefully.
    console.error("[billing/subscription] getSubscriptionForUser", error.message);
    return null;
  }
  return (data as Subscription | null) ?? null;
}

/** The user's effective plan: the subscribed plan when active, else "free". */
export async function getCurrentPlanId(userId: string): Promise<PlanId> {
  const sub = await getSubscriptionForUser(userId);
  if (sub && isActiveStatus(sub.status)) return normalizePlan(sub.plan);
  return "free";
}

export interface PlanContext {
  plan: PlanId;
  subscription: Subscription | null;
  isTrialing: boolean;
}

export async function getPlanContext(userId: string): Promise<PlanContext> {
  const subscription = await getSubscriptionForUser(userId);
  const active = subscription && isActiveStatus(subscription.status);
  return {
    plan: active ? normalizePlan(subscription.plan) : "free",
    subscription,
    isTrialing: subscription?.status === "trialing",
  };
}

/** Gating helpers bound to a resolved plan. */
export function gateHub(plan: PlanId, hub: HubKey): boolean {
  return canAccessHub(plan, hub);
}

export function gateMinPlan(plan: PlanId, required: PlanId): boolean {
  return hasAtLeast(plan, required);
}

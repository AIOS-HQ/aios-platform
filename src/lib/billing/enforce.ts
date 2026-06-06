import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getProfile } from "@/lib/data/profile";
import { getPlanContext } from "@/lib/billing/subscription";
import {
  canAccessHub,
  HUB_MIN_PLAN,
  type HubKey,
  type PlanId,
} from "@/lib/billing/plans";

/**
 * Harmony hub access control (PR #6).
 *
 * Reuses the PR #72 plan model (`canAccessHub` / `HUB_MIN_PLAN`) verbatim — no
 * new billing or subscription architecture. Enforcement is OFF by default and
 * fully inert while billing is dormant, so existing behavior is unchanged until
 * an operator explicitly turns it on (after test-mode validation).
 */

/** Master switch. Set `BILLING_ENFORCEMENT=on` to activate gating. */
export function isEnforcementEnabled(): boolean {
  return (process.env.BILLING_ENFORCEMENT ?? "").trim().toLowerCase() === "on";
}

/** True once Stripe is configured (used to skip all billing work when dormant). */
export function isBillingActive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Users created before BILLING_ENFORCEMENT_CUTOFF (ISO date) are exempt. */
function isGrandfathered(createdAt: string | null): boolean {
  const cutoff = process.env.BILLING_ENFORCEMENT_CUTOFF;
  if (!cutoff || !createdAt) return false;
  const c = Date.parse(cutoff);
  const u = Date.parse(createdAt);
  return Number.isFinite(c) && Number.isFinite(u) && u < c;
}

interface EnforcementContext {
  role: string | null;
  createdAt: string | null;
  plan: PlanId;
  status: string | null;
}

// Deduped per-request: nested guards + the past-due banner share one load.
const loadContext = cache(async (userId: string): Promise<EnforcementContext> => {
  const [profile, planCtx] = await Promise.all([
    getProfile(userId),
    getPlanContext(userId),
  ]);
  return {
    role: profile?.role ?? null,
    createdAt: profile?.created_at ?? null,
    plan: planCtx.plan,
    status: planCtx.subscription?.status ?? null,
  };
});

/**
 * Central route → hub map. Anything not listed (the dashboard, tasks, goals,
 * notes, brain, personal) falls back to the Personal baseline. Edit here to
 * adjust which routes belong to which hub.
 */
const ROUTE_HUB: Array<[string, HubKey]> = [
  ["/harmony/companies", "business"],
  ["/harmony/departments", "business"],
  ["/harmony/objectives", "business"],
  ["/harmony/work", "business"],
  ["/harmony/comms", "business"],
  ["/harmony/content", "business"],
  ["/harmony/approvals", "business"],
  ["/harmony/operator", "business"],
  ["/harmony/code", "business"],
  ["/harmony/advisor", "harmony"],
  ["/harmony/activity", "harmony"],
];

export function hubForPath(pathname: string): HubKey {
  for (const [prefix, hub] of ROUTE_HUB) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return hub;
  }
  return "personal";
}

/**
 * Redirect to /pricing when the user's plan can't access `hub`.
 * No-op when enforcement is off, for admins, and for grandfathered users.
 * Auth is handled by middleware, so a missing user is left alone here.
 */
export async function enforceHubAccess(hub: HubKey, user: User | null): Promise<void> {
  if (!isEnforcementEnabled()) return;
  if (!user) return;
  const ctx = await loadContext(user.id);
  if (ctx.role === "admin") return;
  if (isGrandfathered(ctx.createdAt)) return;
  if (canAccessHub(ctx.plan, hub)) return;
  redirect(`/pricing?from=${hub}&required=${HUB_MIN_PLAN[hub]}`);
}

/** Non-blocking notice for the current user (e.g. past-due). Independent of the flag. */
export async function getBillingNotice(user: User | null): Promise<"past_due" | null> {
  if (!user) return null;
  const ctx = await loadContext(user.id);
  return ctx.status === "past_due" ? "past_due" : null;
}

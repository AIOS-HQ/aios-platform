import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, isPlanId, type PlanId } from "@/lib/billing/plans";
import {
  createCustomer,
  getPriceId,
  type StripeSubscription,
} from "@/lib/billing/stripe";

/**
 * Server-only billing persistence. All writes use the service-role admin client
 * (RLS bypass) because webhook events and customer provisioning are not tied to
 * an end-user session. Reads for display/gating live in `subscription.ts` and
 * go through the RLS-scoped server client instead.
 */

/** Map a Stripe Price ID back to a PlanId via the configured env vars. */
export function planIdFromPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  for (const plan of PLANS) {
    if (getPriceId(plan.priceEnvKey) === priceId) return plan.id;
  }
  return "free";
}

export async function getCustomerIdForUser(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.stripe_customer_id as string | undefined) ?? null;
}

export async function userIdForCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function saveCustomerMapping(userId: string, customerId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("billing_customers")
    .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
  if (error) console.error("[billing/store] saveCustomerMapping", error);
}

/** Get the user's Stripe customer id, creating the customer + mapping if needed. */
export async function getOrCreateCustomerId(userId: string, email: string): Promise<string | null> {
  const existing = await getCustomerIdForUser(userId);
  if (existing) return existing;
  const customer = await createCustomer(email, userId);
  await saveCustomerMapping(userId, customer.id);
  return customer.id;
}

/** Upsert subscription state from a Stripe subscription object. */
export async function upsertSubscription(
  sub: StripeSubscription,
  userIdHint?: string | null,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[billing/store] upsertSubscription: admin client unavailable");
    return;
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : "";
  const userId = userIdHint ?? (customerId ? await userIdForCustomer(customerId) : null);
  if (!userId) {
    console.error("[billing/store] upsertSubscription: no user mapping for customer", customerId);
    return;
  }

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planIdFromPriceId(priceId);
  const toIso = (sec: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);

  const row = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan,
    price_id: priceId,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    trial_end: toIso(sub.trial_end),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) console.error("[billing/store] upsertSubscription", error);
}

/** Mark a subscription canceled/removed (customer.subscription.deleted). */
export async function markSubscriptionDeleted(subscriptionId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) console.error("[billing/store] markSubscriptionDeleted", error);
}

/** Normalize a raw plan string read from the DB into a PlanId. */
export function normalizePlan(value: string | null | undefined): PlanId {
  return isPlanId(value) ? value : "free";
}

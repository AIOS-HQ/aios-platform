/**
 * Billing row types mirroring the Supabase billing schema
 * (see migration 20260602000000_billing_subscriptions.sql).
 *
 * Kept alongside the billing module (rather than in `@/types/database`) so the
 * billing feature is self-contained. Rows are written by the service-role
 * webhook and are owner-readable via RLS.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface BillingCustomer {
  user_id: string;
  stripe_customer_id: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus | string;
  plan: string;
  price_id: string | null;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

/** A billing-history row shaped for display (built from a Stripe invoice). */
export interface InvoiceView {
  id: string;
  date: string;
  amount: string;
  status: string;
  url: string | null;
}

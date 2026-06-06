import "server-only";

import crypto from "node:crypto";

/**
 * Minimal, dependency-free Stripe client.
 *
 * Calls the Stripe REST API directly with `fetch` and verifies webhook
 * signatures with `node:crypto` — deliberately avoiding the `stripe` SDK so no
 * new dependency / lockfile entry is required. All configuration is read lazily
 * at call time, so a missing key never breaks the build; only the runtime call
 * that needs it fails (guarded by `isStripeConfigured`).
 */

const STRIPE_API = "https://api.stripe.com/v1";

export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY ?? "";
}

export function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET ?? "";
}

/** True when the secret key is present (enough to create sessions / API calls). */
export function isStripeConfigured(): boolean {
  return getStripeSecretKey().length > 0;
}

/** Resolve a plan's configured Stripe Price ID from its env var name. */
export function getPriceId(priceEnvKey: string | null): string | null {
  if (!priceEnvKey) return null;
  const v = process.env[priceEnvKey];
  return v && v.length > 0 ? v : null;
}

class StripeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StripeError";
    this.status = status;
  }
}

/** Encode a (possibly nested) params object as Stripe-style form data. */
function encodeForm(obj: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(...encodeForm(value as Record<string, unknown>, field));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          parts.push(...encodeForm(item as Record<string, unknown>, `${field}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${field}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) throw new StripeError("Stripe is not configured", 503);

  let url = `${STRIPE_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;

  if (method === "GET" && params) {
    const qs = encodeForm(params).join("&");
    if (qs) url += `?${qs}`;
  } else if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params ? encodeForm(params).join("&") : "";
  }

  const res = await fetch(url, { method, headers, body });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const message = json?.error?.message ?? `Stripe request failed (${res.status})`;
    throw new StripeError(message, res.status);
  }
  return json;
}

export interface StripeCustomer {
  id: string;
}
export interface StripeCheckoutSession {
  id: string;
  url: string | null;
}
export interface StripePortalSession {
  url: string;
}
export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  current_period_start: number | null;
  current_period_end: number | null;
  trial_end: number | null;
  items: { data: Array<{ price: { id: string } }> };
}
export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export async function createCustomer(email: string, userId: string): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>("POST", "/customers", {
    email,
    metadata: { user_id: userId },
  });
}

export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  trialDays: number;
  successUrl: string;
  cancelUrl: string;
  userId: string;
}): Promise<StripeCheckoutSession> {
  const subscriptionData: Record<string, unknown> = {
    metadata: { user_id: opts.userId },
  };
  if (opts.trialDays > 0) subscriptionData.trial_period_days = opts.trialDays;

  const params: Record<string, unknown> = {
    mode: "subscription",
    customer: opts.customerId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    allow_promotion_codes: true,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    subscription_data: subscriptionData,
  };
  return stripeRequest<StripeCheckoutSession>("POST", "/checkout/sessions", params);
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("GET", `/subscriptions/${id}`);
}

export async function listInvoices(customerId: string, limit = 12): Promise<StripeInvoice[]> {
  const res = await stripeRequest<{ data: StripeInvoice[] }>("GET", "/invoices", {
    customer: customerId,
    limit,
  });
  return res.data ?? [];
}

/**
 * Verify a Stripe webhook signature and return the parsed event.
 * Implements the same scheme as `stripe.webhooks.constructEvent`:
 * signed_payload = `${timestamp}.${rawBody}`, HMAC-SHA256 with the endpoint
 * secret, compared against the `v1` signatures (timing-safe), with a tolerance
 * window on the timestamp.
 */
export function constructWebhookEvent(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Record<string, unknown> {
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");
  if (!secret) throw new Error("Missing webhook secret");

  const parts = signatureHeader.split(",").map((p) => p.trim());
  let timestamp = "";
  const v1: string[] = [];
  for (const part of parts) {
    const [k, val] = part.split("=");
    if (k === "t") timestamp = val;
    else if (k === "v1" && val) v1.push(val);
  }
  if (!timestamp || v1.length === 0) throw new Error("Invalid Stripe-Signature header");

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) throw new Error("Invalid signature timestamp");
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) throw new Error("Signature timestamp outside tolerance");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  const match = v1.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!match) throw new Error("Signature verification failed");

  return JSON.parse(rawBody) as Record<string, unknown>;
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { env } from "@/lib/env";
import {
  createCheckoutSession,
  getPriceId,
  isStripeConfigured,
} from "@/lib/billing/stripe";
import { getOrCreateCustomerId } from "@/lib/billing/store";
import { getPlan, isPlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";

/** Create a Stripe Checkout Session for the authenticated user's chosen plan. */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  const planId = typeof body?.plan === "string" ? body.plan : "";
  if (!isPlanId(planId)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  const plan = getPlan(planId);
  if (!plan || !plan.selfServe) {
    return NextResponse.json({ error: "not_self_serve" }, { status: 400 });
  }
  const priceId = getPriceId(plan.priceEnvKey);
  if (!priceId) {
    return NextResponse.json({ error: "price_unconfigured" }, { status: 503 });
  }

  try {
    const customerId = await getOrCreateCustomerId(user.id, user.email ?? "");
    if (!customerId) {
      return NextResponse.json({ error: "customer_failed" }, { status: 503 });
    }
    const base = (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
    const session = await createCheckoutSession({
      customerId,
      priceId,
      trialDays: plan.trialDays,
      successUrl: `${base}/settings?billing=success`,
      cancelUrl: `${base}/pricing?billing=canceled`,
      userId: user.id,
    });
    if (!session.url) {
      return NextResponse.json({ error: "no_session_url" }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[api/billing/checkout]", e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}

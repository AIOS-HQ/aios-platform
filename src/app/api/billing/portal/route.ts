import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { env } from "@/lib/env";
import { createPortalSession, isStripeConfigured } from "@/lib/billing/stripe";
import { getCustomerIdForUser } from "@/lib/billing/store";

export const runtime = "nodejs";

/** Create a Stripe Billing Portal session so the user can manage their plan. */
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const customerId = await getCustomerIdForUser(user.id);
  if (!customerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 409 });
  }

  try {
    const base = (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
    const session = await createPortalSession(customerId, `${base}/settings`);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[api/billing/portal]", e);
    return NextResponse.json({ error: "portal_failed" }, { status: 502 });
  }
}

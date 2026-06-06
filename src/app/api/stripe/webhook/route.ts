import { NextResponse } from "next/server";
import {
  constructWebhookEvent,
  getSubscription,
  getWebhookSecret,
  isStripeConfigured,
  type StripeSubscription,
} from "@/lib/billing/stripe";
import { markSubscriptionDeleted, upsertSubscription } from "@/lib/billing/store";

export const runtime = "nodejs";

function metaUserId(obj: Record<string, unknown>): string | null {
  const meta = obj.metadata as Record<string, unknown> | undefined;
  return typeof meta?.user_id === "string" ? meta.user_id : null;
}

/** Stripe webhook receiver. Verifies the signature, then syncs subscription state. */
export async function POST(request: Request) {
  const secret = getWebhookSecret();
  if (!isStripeConfigured() || !secret) {
    return NextResponse.json({ error: "billing_unconfigured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Record<string, unknown>;
  try {
    event = constructWebhookEvent(raw, signature, secret);
  } catch (e) {
    console.error("[api/stripe/webhook] signature", (e as Error).message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const type = String(event.type ?? "");
    const data = event.data as { object?: Record<string, unknown> } | undefined;
    const obj = data?.object ?? {};

    switch (type) {
      case "checkout.session.completed": {
        const subId = typeof obj.subscription === "string" ? obj.subscription : null;
        const userId =
          typeof obj.client_reference_id === "string" ? obj.client_reference_id : null;
        if (subId) {
          const sub = await getSubscription(subId);
          await upsertSubscription(sub, userId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscription(obj as unknown as StripeSubscription, metaUserId(obj));
        break;
      }
      case "customer.subscription.deleted": {
        const id = typeof obj.id === "string" ? obj.id : null;
        if (id) await markSubscriptionDeleted(id);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[api/stripe/webhook] handler", e);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

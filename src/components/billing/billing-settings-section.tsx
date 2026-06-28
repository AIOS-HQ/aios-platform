import { getPlanContext } from "@/lib/billing/subscription";
import { isStripeConfigured, listInvoices } from "@/lib/billing/stripe";
import type { InvoiceView } from "@/lib/billing/types";
import { BillingCard } from "@/components/billing/billing-card";

export async function BillingSettingsSection({ userId }: { userId: string }) {
  const planContext = await getPlanContext(userId);
  let invoices: InvoiceView[] = [];
  const customerId = planContext.subscription?.stripe_customer_id;

  if (customerId && isStripeConfigured()) {
    try {
      const raw = await listInvoices(customerId);
      invoices = raw.map((inv) => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toLocaleDateString(),
        amount: new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: (inv.currency || "usd").toUpperCase(),
        }).format((inv.amount_paid || inv.amount_due) / 100),
        status: inv.status ?? "",
        url: inv.hosted_invoice_url ?? inv.invoice_pdf ?? null,
      }));
    } catch (e) {
      console.error("[billing] listInvoices", e);
    }
  }

  return (
    <BillingCard
      plan={planContext.plan}
      subscription={planContext.subscription}
      isTrialing={planContext.isTrialing}
      invoices={invoices}
    />
  );
}

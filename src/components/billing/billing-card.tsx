import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import type { PlanId } from "@/lib/billing/plans";
import type { InvoiceView, Subscription } from "@/lib/billing/types";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function statusVariant(
  status: string | undefined,
): "success" | "warning" | "secondary" | "outline" {
  if (status === "active" || status === "trialing") return "success";
  if (status === "past_due" || status === "unpaid") return "warning";
  if (status === "canceled") return "secondary";
  return "outline";
}

export async function BillingCard({
  plan,
  subscription,
  isTrialing,
  invoices,
}: {
  plan: PlanId;
  subscription: Subscription | null;
  isTrialing: boolean;
  invoices: InvoiceView[];
}) {
  const t = await getTranslations("billing");
  const planNames = t.raw("planNames") as Record<string, string>;
  const statuses = t.raw("statuses") as Record<string, string>;

  const planName = planNames[plan] ?? plan;
  const status = subscription?.status;
  const statusLabel = (status && statuses[status]) || status || "";

  const trialEnd = fmtDate(subscription?.trial_end ?? null);
  const periodEnd = fmtDate(subscription?.current_period_end ?? null);
  const isFree = plan === "free" || !subscription;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("currentPlanLabel")}</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{planName}</span>
              {status ? (
                <Badge variant={statusVariant(status)}>{statusLabel}</Badge>
              ) : null}
            </div>
          </div>
          {isFree ? (
            <Button asChild>
              <Link href="/pricing">{t("choosePlan")}</Link>
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ManageBillingButton label={t("manage")} errorLabel={t("manageError")} />
              <Button asChild variant="ghost">
                <Link href="/pricing">{t("viewPlans")}</Link>
              </Button>
            </div>
          )}
        </div>

        {isFree ? (
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">{t("freeTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("freeBody")}</p>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {isTrialing && trialEnd ? (
              <div>
                <dt className="text-sm text-muted-foreground">{t("trialEndsLabel")}</dt>
                <dd className="text-sm font-medium">{trialEnd}</dd>
              </div>
            ) : null}
            {periodEnd ? (
              <div>
                <dt className="text-sm text-muted-foreground">
                  {subscription?.cancel_at_period_end ? t("cancelsLabel") : t("renewsLabel")}
                </dt>
                <dd className="text-sm font-medium">{periodEnd}</dd>
              </div>
            ) : null}
          </dl>
        )}

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium">{t("historyTitle")}</p>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{inv.amount}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.date} · {inv.status}
                    </p>
                  </div>
                  {inv.url ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={inv.url} target="_blank" rel="noopener noreferrer">
                        {t("view")}
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

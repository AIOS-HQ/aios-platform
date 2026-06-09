import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { getProfile, getUserSettings } from "@/lib/data/profile";
import { getPlanContext } from "@/lib/billing/subscription";
import { isStripeConfigured, listInvoices } from "@/lib/billing/stripe";
import type { InvoiceView } from "@/lib/billing/types";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ThemePreference } from "@/components/settings/theme-preference";
import { AccountCard } from "@/components/settings/account-card";
import { DataCard } from "@/components/settings/data-card";
import { BillingCard } from "@/components/billing/billing-card";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const ti = await getTranslations("integrations");
  const tm = await getTranslations("memory");
  const ta = await getTranslations("activity");
  const tc = await getTranslations("connections");
  const user = await requireUser();
  const [profile, settings, planContext] = await Promise.all([
    getProfile(user.id),
    getUserSettings(user.id),
    getPlanContext(user.id),
  ]);

  // Billing history is fetched live from Stripe when a customer exists.
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
      console.error("[settings] listInvoices", e);
    }
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:max-w-2xl">
        <ProfileForm fullName={profile?.full_name ?? ""} />
        <PreferencesForm
          language={settings?.preferred_language ?? "en"}
          timezone={settings?.timezone ?? "UTC"}
        />
        <ThemePreference theme={settings?.theme ?? "system"} />
        <BillingCard
          plan={planContext.plan}
          subscription={planContext.subscription}
          isTrialing={planContext.isTrialing}
          invoices={invoices}
        />
        <Card>
          <CardHeader>
            <CardTitle>{ti("title")}</CardTitle>
            <CardDescription>{ti("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/settings/integrations">{ti("manage")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tc("title")}</CardTitle>
            <CardDescription>{tc("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/settings/connections">{tc("manage")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tm("title")}</CardTitle>
            <CardDescription>{tm("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/settings/memory">{tm("manage")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{ta("title")}</CardTitle>
            <CardDescription>{ta("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/settings/activity">{ta("manage")}</Link>
            </Button>
          </CardContent>
        </Card>
        <AccountCard
          email={user.email ?? ""}
          role={profile?.role ?? "personal_user"}
        />
        <DataCard email={user.email ?? ""} />
      </div>
    </>
  );
}

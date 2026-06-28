import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { isFounderUser } from "@/lib/auth/roles";
import { getProfile, getUserSettings } from "@/lib/data/profile";
import { settingsRouteCardsForRole } from "@/lib/settings/routes";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ThemePreference } from "@/components/settings/theme-preference";
import { AccountCard } from "@/components/settings/account-card";
import { DataCard } from "@/components/settings/data-card";
import { BillingSettingsSection } from "@/components/billing/billing-settings-section";
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
  const tau = await getTranslations("auditor");
  const user = await requireUser();
  const [profile, settings] = await Promise.all([
    getProfile(user.id),
    getUserSettings(user.id),
  ]);
  const isFounder = isFounderUser(user.email, profile?.role);

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
        <BillingSettingsSection userId={user.id} />
        {settingsRouteCardsForRole(isFounder).map((card) => {
          const tt = tau;
          return (
            <Card key={card.key}>
              <CardHeader>
                <CardTitle>{tt("title")}</CardTitle>
                <CardDescription>{tt("subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href={card.href}>{tt("manage")}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <AccountCard
          email={user.email ?? ""}
          role={profile?.role ?? "personal_user"}
        />
        <DataCard email={user.email ?? ""} />
      </div>
    </>
  );
}

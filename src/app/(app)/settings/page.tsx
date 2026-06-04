import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { getProfile, getUserSettings } from "@/lib/data/profile";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ThemePreference } from "@/components/settings/theme-preference";
import { AccountCard } from "@/components/settings/account-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const [profile, settings] = await Promise.all([
    getProfile(user.id),
    getUserSettings(user.id),
  ]);

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
        <AccountCard
          email={user.email ?? ""}
          role={profile?.role ?? "personal_user"}
        />
      </div>
    </>
  );
}

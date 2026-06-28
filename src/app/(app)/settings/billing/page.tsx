import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { PageHeader } from "@/components/shared/page-header";
import { BillingSettingsSection } from "@/components/billing/billing-settings-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

export default async function BillingPage() {
  const t = await getTranslations("billing");
  const user = await requireUser();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 lg:max-w-2xl">
        <BillingSettingsSection userId={user.id} />
      </div>
    </>
  );
}

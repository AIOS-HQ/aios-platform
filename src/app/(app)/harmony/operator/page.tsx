import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isRealProviderConfigured } from "@/lib/ai/provider";
import { PageHeader } from "@/components/shared/page-header";
import { OperatorConsole } from "@/components/harmony/operator/operator-console";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator");
  return { title: t("title") };
}

export default async function OperatorPage() {
  const t = await getTranslations("operator");
  const isMock = !isRealProviderConfigured();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <OperatorConsole isMock={isMock} />
    </>
  );
}

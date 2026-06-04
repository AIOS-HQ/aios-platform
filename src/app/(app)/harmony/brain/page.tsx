import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listBrainEntries } from "@/lib/data/brain";
import { PageHeader } from "@/components/shared/page-header";
import { BrainList } from "@/components/harmony/brain/brain-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brain");
  return { title: t("title") };
}

export default async function BrainPage() {
  const t = await getTranslations("brain");
  const entries = await listBrainEntries();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <BrainList entries={entries} />
    </>
  );
}

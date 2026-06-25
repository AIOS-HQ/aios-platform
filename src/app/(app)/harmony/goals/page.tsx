import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listGoals } from "@/lib/data/goals";
import { PageHeader } from "@/components/shared/page-header";
import { GoalList } from "@/components/harmony/goals/goal-list";
import { AskHarmonyCard } from "@/components/harmony/operator/ask-harmony-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("goals");
  return { title: t("title") };
}

export default async function GoalsPage() {
  const t = await getTranslations("goals");
  const goals = await listGoals();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AskHarmonyCard />
      <GoalList goals={goals} />
    </>
  );
}

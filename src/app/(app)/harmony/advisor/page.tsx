import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";
import { listNotes } from "@/lib/data/notes";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { PageHeader } from "@/components/shared/page-header";
import { AdvisorPanel } from "@/components/harmony/advisor/advisor-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("advisor");
  return { title: t("title") };
}

export default async function AdvisorPage() {
  const t = await getTranslations("advisor");
  const [tasks, goals, notes] = await Promise.all([
    listTasks(),
    listGoals(),
    listNotes(),
  ]);
  const recommendations = buildRecommendations({ tasks, goals, notes });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 lg:max-w-3xl">
        <AdvisorPanel recommendations={recommendations} />
        <p className="text-xs text-muted-foreground">{t("ruleBasedNote")}</p>
      </div>
    </>
  );
}

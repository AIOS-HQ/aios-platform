import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isRealProviderConfigured } from "@/lib/ai/provider";
import { listTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";
import { listNotes } from "@/lib/data/notes";
import { listBrainEntries } from "@/lib/data/brain";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { PageHeader } from "@/components/shared/page-header";
import { OperatorConsole } from "@/components/harmony/operator/operator-console";
import { AdvisorPanel } from "@/components/harmony/advisor/advisor-panel";
import { BrainList } from "@/components/harmony/brain/brain-list";
import { HarmonyWorkspace } from "@/components/harmony/harmony-workspace";
import { HarmonyAwareness } from "@/components/harmony/harmony-awareness";
import { HarmonyCollaboration } from "@/components/harmony/harmony-collaboration";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator");
  return { title: t("title") };
}

const TABS = ["chat", "suggestions", "memory"] as const;
type Tab = (typeof TABS)[number];

/**
 * The one Harmony experience: Chat + Suggestions + Memory in a single interface
 * (formerly the separate Life Operator, Life Advisor, and Personal Brain pages,
 * which now redirect here). Harmony is the AI Chief of Staff; this is the
 * canonical customer surface.
 */
export default async function HarmonyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getTranslations("operator");
  const ta = await getTranslations("advisor");
  const { tab } = await searchParams;
  const initialTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "chat";

  const isMock = !isRealProviderConfigured();
  const [tasks, goals, notes, brain] = await Promise.all([
    listTasks(),
    listGoals(),
    listNotes(),
    listBrainEntries(),
  ]);
  const recommendations = buildRecommendations({ tasks, goals, notes });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <HarmonyAwareness />
      <HarmonyWorkspace
        initialTab={initialTab}
        chat={
          <>
            <HarmonyCollaboration />
            <OperatorConsole isMock={isMock} />
          </>
        }
        suggestions={
          <div className="grid gap-4 lg:max-w-3xl">
            <AdvisorPanel recommendations={recommendations} />
            <p className="text-xs text-muted-foreground">{ta("ruleBasedNote")}</p>
          </div>
        }
        memory={<BrainList entries={brain} />}
      />
    </>
  );
}

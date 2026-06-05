import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";
import { PageHeader } from "@/components/shared/page-header";
import { TaskList } from "@/components/harmony/tasks/task-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title") };
}

export default async function TasksPage() {
  const t = await getTranslations("tasks");
  const [tasks, goals] = await Promise.all([listTasks(), listGoals()]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <TaskList tasks={tasks} goals={goals} />
    </>
  );
}

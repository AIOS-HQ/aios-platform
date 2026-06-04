"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GoalDialog } from "./goal-dialog";
import { GoalCard } from "./goal-card";
import type { GoalStatus, PersonalGoal } from "@/types/database";

type Filter = "all" | GoalStatus;
const FILTERS: Filter[] = ["all", "active", "completed"];

export function GoalList({ goals }: { goals: PersonalGoal[] }) {
  const t = useTranslations("goals");
  const [filter, setFilter] = useState<Filter>("all");
  const filtered =
    filter === "all" ? goals : goals.filter((g) => g.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel={t("filterLabel")}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === "all" ? t("filter.all") : t(`status.${f}`),
          }))}
        />
        <GoalDialog>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Button>
        </GoalDialog>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <GoalDialog>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </GoalDialog>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

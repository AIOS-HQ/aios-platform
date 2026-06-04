"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GoalDialog } from "./goal-dialog";
import { GoalCard } from "./goal-card";
import { cn } from "@/lib/utils";
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
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {f === "all" ? t("filter.all") : t(`status.${f}`)}
            </button>
          ))}
        </div>
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

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoalDialog } from "./goal-dialog";
import { GoalCard } from "./goal-card";
import type { GoalStatus, PersonalGoal } from "@/types/database";

type Filter = "all" | GoalStatus;
type Sort = "created" | "progress" | "target";
const FILTERS: Filter[] = ["all", "active", "completed"];

export function GoalList({ goals }: { goals: PersonalGoal[] }) {
  const t = useTranslations("goals");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("created");

  const visible = useMemo(() => {
    const filtered =
      filter === "all" ? goals : goals.filter((g) => g.status === filter);
    const arr = [...filtered];
    if (sort === "progress") {
      arr.sort((a, b) => b.progress - a.progress);
    } else if (sort === "target") {
      arr.sort((a, b) =>
        (a.target_date ?? "9999-99-99").localeCompare(
          b.target_date ?? "9999-99-99",
        ),
      );
    } else {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return arr;
  }, [goals, filter, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<Filter>
          ariaLabel={t("filterLabel")}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === "all" ? t("filter.all") : t(`status.${f}`),
          }))}
        />
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label={t("sort.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">{t("sort.created")}</SelectItem>
              <SelectItem value="progress">{t("sort.progress")}</SelectItem>
              <SelectItem value="target">{t("sort.target")}</SelectItem>
            </SelectContent>
          </Select>
          <GoalDialog>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </GoalDialog>
        </div>
      </div>

      {visible.length === 0 ? (
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
          {visible.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

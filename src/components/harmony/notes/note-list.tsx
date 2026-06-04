"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NoteDialog } from "./note-dialog";
import { NoteCard } from "./note-card";
import { daysSince } from "@/lib/format";
import type { PersonalNote } from "@/types/database";

type Recency = "all" | "week" | "month";
type Sort = "updated" | "created" | "title";

export function NoteList({ notes }: { notes: PersonalNote[] }) {
  const t = useTranslations("notes");
  const [query, setQuery] = useState("");
  const [recency, setRecency] = useState<Recency>("all");
  const [sort, setSort] = useState<Sort>("updated");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = notes.filter((n) => {
      if (
        q &&
        !(
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      if (recency === "week" && daysSince(n.updated_at) >= 7) return false;
      if (recency === "month" && daysSince(n.updated_at) >= 31) return false;
      return true;
    });
    if (sort === "title") {
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sort === "created") {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
      arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return arr;
  }, [notes, query, recency, sort]);

  const isFiltering = query.trim() !== "" || recency !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Recency>
            ariaLabel={t("filter.label")}
            value={recency}
            onChange={setRecency}
            options={[
              { value: "all", label: t("filter.all") },
              { value: "week", label: t("filter.week") },
              { value: "month", label: t("filter.month") },
            ]}
          />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label={t("sort.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">{t("sort.updated")}</SelectItem>
              <SelectItem value="created">{t("sort.created")}</SelectItem>
              <SelectItem value="title">{t("sort.title")}</SelectItem>
            </SelectContent>
          </Select>
          <NoteDialog>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </NoteDialog>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={isFiltering ? Search : StickyNote}
          title={isFiltering ? t("noResults.title") : t("empty.title")}
          description={
            isFiltering ? t("noResults.description") : t("empty.description")
          }
        >
          {!isFiltering && (
            <NoteDialog>
              <Button variant="outline">
                <Plus className="size-4" aria-hidden="true" />
                {t("new")}
              </Button>
            </NoteDialog>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

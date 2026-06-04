"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BrainCircuit, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BrainEntryDialog } from "./brain-entry-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import { deleteBrainEntry } from "@/lib/harmony/brain-actions";
import { formatDate } from "@/lib/format";
import type { BrainKind, PersonalBrainEntry } from "@/types/database";

type KindFilter = "all" | BrainKind;
const KINDS: KindFilter[] = ["all", "manual", "note", "preference", "goal"];

export function BrainList({ entries }: { entries: PersonalBrainEntry[] }) {
  const t = useTranslations("brain");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [entries, query, kind]);

  const isFiltering = query.trim() !== "" || kind !== "all";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
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
          <BrainEntryDialog>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </BrainEntryDialog>
        </div>
        <SegmentedControl<KindFilter>
          ariaLabel={t("filter.label")}
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({
            value: k,
            label: k === "all" ? t("filter.all") : t(`kind.${k}`),
          }))}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={isFiltering ? Search : BrainCircuit}
          title={isFiltering ? t("noResults.title") : t("empty.title")}
          description={
            isFiltering ? t("noResults.description") : t("empty.description")
          }
        >
          {!isFiltering && (
            <BrainEntryDialog>
              <Button variant="outline">
                <Plus className="size-4" aria-hidden="true" />
                {t("new")}
              </Button>
            </BrainEntryDialog>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <Card key={entry.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0 space-y-1">
                  <h3 className="truncate font-semibold">{entry.title}</h3>
                  <Badge variant="secondary">{t(`kind.${entry.kind}`)}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <BrainEntryDialog entry={entry}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("edit")}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                  </BrainEntryDialog>
                  <ConfirmDeleteDialog
                    action={deleteBrainEntry}
                    id={entry.id}
                    itemTitle={entry.title}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={tc("delete")}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {entry.content && (
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {entry.content}
                  </p>
                )}
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <span className="mt-auto pt-1 text-xs text-muted-foreground">
                  {formatDate(entry.created_at, locale)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

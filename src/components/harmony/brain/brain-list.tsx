"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BrainCircuit, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { BrainEntryDialog } from "./brain-entry-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import { deleteBrainEntry } from "@/lib/harmony/brain-actions";
import { formatDate } from "@/lib/format";
import type { PersonalBrainEntry } from "@/types/database";

export function BrainList({ entries }: { entries: PersonalBrainEntry[] }) {
  const t = useTranslations("brain");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  return (
    <div className="space-y-4">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title={query ? t("noResults.title") : t("empty.title")}
          description={query ? t("noResults.description") : t("empty.description")}
        >
          {!query && (
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
                <ConfirmDeleteDialog
                  action={deleteBrainEntry}
                  id={entry.id}
                  itemTitle={entry.title}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </ConfirmDeleteDialog>
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

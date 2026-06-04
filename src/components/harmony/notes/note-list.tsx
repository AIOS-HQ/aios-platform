"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { NoteDialog } from "./note-dialog";
import { NoteCard } from "./note-card";
import type { PersonalNote } from "@/types/database";

export function NoteList({ notes }: { notes: PersonalNote[] }) {
  const t = useTranslations("notes");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q),
    );
  }, [notes, query]);

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
        <NoteDialog>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Button>
        </NoteDialog>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={query ? t("noResults.title") : t("empty.title")}
          description={query ? t("noResults.description") : t("empty.description")}
        >
          {!query && (
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
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

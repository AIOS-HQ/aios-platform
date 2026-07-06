"use client";

import { useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchJulius } from "./search-actions";
import type { JuliusHit, JuliusScope } from "./julius-search-types";

/**
 * Julius semantic-search panel — lets the founder search organizational memory,
 * decisions, and knowledge by meaning directly from Harmony. Calls the
 * searchJulius Server Action (existing Julius retrieval libs); no client secrets.
 */
export function JuliusSearch() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<JuliusScope>("company");
  const [hits, setHits] = useState<JuliusHit[] | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      const results = await searchJulius(q, scope);
      setHits(results);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Semantic memory search
        </CardTitle>
        <CardDescription>
          Search organizational memory, decisions, and knowledge by meaning — scoped to this company or across all
          projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. what did we decide about the marketplace?"
              className="pl-8"
              aria-label="Search Julius memory"
            />
          </div>
          <div className="flex rounded-md border p-0.5">
            {(["company", "global"] as JuliusScope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "company" ? "This company" : "All projects"}
              </button>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={pending || !query.trim()}>
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-3.5" aria-hidden="true" />
            )}
            Search
          </Button>
        </form>

        {hits !== null ? (
          hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching memory found. Results improve as agents record work, and semantic ranking activates once
              embeddings are indexed.
            </p>
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {h.kind}
                    </Badge>
                    <span className="text-sm font-medium">{h.title}</span>
                    {h.similarity !== null ? (
                      <Badge variant="secondary" className="ml-auto shrink-0 tabular-nums">
                        {Math.round(h.similarity * 100)}% match
                      </Badge>
                    ) : null}
                  </div>
                  {h.content ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.content}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    by {h.agent} · importance {h.importance}/5
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

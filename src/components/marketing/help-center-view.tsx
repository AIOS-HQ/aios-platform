"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Brain, Building2, Calendar, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

export type HelpArticle = { title: string; body: string };
export type HelpCategory = {
  id: string;
  icon: string;
  title: string;
  description: string;
  articles: HelpArticle[];
};
type Labels = { searchPlaceholder: string; noResults: string; resultsLabel: string };

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles,
  Calendar,
  Building2,
  Brain,
  ShieldCheck,
};

/** Client-side filterable Help Center: search across categories + articles. */
export function HelpCenterView({
  categories,
  labels,
}: {
  categories: HelpCategory[];
  labels: Labels;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        articles: c.articles.filter((a) =>
          `${a.title} ${a.body} ${c.title} ${c.description}`.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.articles.length > 0);
  }, [categories, q]);

  const count = filtered.reduce((n, c) => n + c.articles.length, 0);

  return (
    <div>
      <div className="relative mx-auto max-w-xl">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="h-12 border-white/15 bg-white/5 pl-11 text-base text-foreground placeholder:text-muted-foreground/70"
        />
      </div>

      {q ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {count} {labels.resultsLabel}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">{labels.noResults}</p>
      ) : (
        <div className="mt-12 flex flex-col gap-14">
          {filtered.map((category) => {
            const Icon = ICONS[category.icon] ?? Sparkles;
            return (
              <section key={category.id} id={`help-${category.id}`} className="scroll-mt-24">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">{category.title}</h2>
                    <p className="mt-1 text-muted-foreground">{category.description}</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {category.articles.map((article) => (
                    <article
                      key={article.title}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
                    >
                      <h3 className="text-base font-semibold text-foreground">{article.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {article.body}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

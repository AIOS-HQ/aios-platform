"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getAiosAgent } from "@/lib/workforce/registry";

/** Path segment → key in the `nav` translation namespace (localized labels). */
const NAV_KEY: Record<string, string> = {
  harmony: "commandCenter",
  workforce: "workforce",
  briefing: "briefing",
  outcomes: "outcomes",
  work: "work",
  "work-items": "workItems",
  review: "review",
  operations: "operations",
  activity: "activity",
  autonomy: "autonomy",
  content: "content",
  approvals: "approvals",
  companies: "companies",
  objectives: "objectives",
  comms: "comms",
  code: "code",
  settings: "settings",
  tasks: "tasks",
  goals: "goals",
  notes: "notes",
  brain: "brain",
  operator: "operator",
  advisor: "advisor",
};

/** Static fallback labels for segments without a nav key (no t() on missing keys). */
const STATIC_LABEL: Record<string, string> = {
  graph: "Relationship Graph",
  auditor: "Auditor",
  integrations: "Integrations",
  connections: "Connections",
  diagnostics: "Diagnostics",
  learning: "Learning",
  memory: "Memory",
  departments: "Departments",
  projects: "Projects",
  personal: "Personal",
};

function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Route-aware Back + breadcrumb trail. Rendered by PageHeader on every page and
 * auto-hides on top-level routes. Back uses browser history when available, else
 * falls back to the parent route — so there's never a dead end.
 */
export function PageBack() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const t = useTranslations("nav");

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null; // top-level page — nothing to go back to

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    let label: string;
    if (NAV_KEY[seg]) label = t(NAV_KEY[seg]);
    else if (STATIC_LABEL[seg]) label = STATIC_LABEL[seg];
    else label = getAiosAgent(seg)?.name ?? titleCase(seg);
    return { href, label };
  });

  const parentHref = crumbs[crumbs.length - 2]?.href ?? "/harmony";

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(parentHref);
  };

  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back
      </button>
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 opacity-50" aria-hidden="true" />}
            {i < crumbs.length - 1 ? (
              <a href={c.href} className="hover:text-foreground hover:underline">{c.label}</a>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

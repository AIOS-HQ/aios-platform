import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import {
  searchMarketplace,
  buildCollections,
  recommendForProfile,
  type MarketplaceItem,
  type MarketplaceItemKind,
} from "@/lib/marketplace";
import { loadStorefrontContext, toDisplayItem } from "@/lib/marketplace/storefront";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { MarketplaceItemCard } from "@/components/marketplace/marketplace-item-card";
import { MarketplaceActions } from "@/components/marketplace/marketplace-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace");
  return { title: t("discover.title") };
}

const FACET_KINDS: MarketplaceItemKind[] = [
  "workforce",
  "department",
  "skill",
  "connector",
  "dashboard",
  "workflow",
  "company_template",
];

function isFacet(v: string | undefined): v is MarketplaceItemKind {
  return !!v && (FACET_KINDS as string[]).includes(v);
}

export default async function MarketplaceDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const t = await getTranslations("marketplace");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const kind = isFacet(sp.kind) ? sp.kind : null;

  const { catalog, signal, installedIds } = await loadStorefrontContext(user.id, companyId);

  const action = (item: MarketplaceItem) => (
    <MarketplaceActions companyId={companyId} itemId={item.id} installed={installedIds.has(item.id)} />
  );

  function grid(items: MarketplaceItem[]) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <MarketplaceItemCard key={it.id} item={toDisplayItem(it)} action={action(it)} />
        ))}
      </div>
    );
  }

  const facetHref = (k: MarketplaceItemKind | null) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (k) params.set("kind", k);
    const qs = params.toString();
    return `/harmony/marketplace/discover${qs ? `?${qs}` : ""}`;
  };

  const results = query
    ? searchMarketplace(query, catalog, kind ? { kinds: [kind] } : {}).map((r) => r.item)
    : [];

  const rec = recommendForProfile(signal, catalog, 8);
  const recommended: MarketplaceItem[] = [];
  const seen = new Set<string>();
  for (const bucket of [rec.workers, rec.departments, rec.skills, rec.connectors, rec.dashboards, rec.workflowPacks]) {
    for (const it of bucket) if (!seen.has(it.id)) { seen.add(it.id); recommended.push(it); }
  }
  const collections = query ? [] : buildCollections({ catalog, signal });

  return (
    <>
      <PageHeader title={t("discover.title")} description={t("discover.subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace">{t("discover.back")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/harmony/marketplace/bundles">{t("discover.exploreBundles")}</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-8">
        {/* Natural-language search */}
        <form method="get" className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={t("discover.searchPlaceholder")}
              aria-label={t("discover.search")}
              className="h-11 flex-1 rounded-xl border bg-background px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button type="submit" className="h-11 px-6">{t("discover.search")}</Button>
          </div>
          <nav aria-label={t("discover.search")} className="flex flex-wrap gap-2">
            <Link
              href={facetHref(null)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent ${kind === null ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {t("discover.allKinds")}
            </Link>
            {FACET_KINDS.map((k) => (
              <Link
                key={k}
                href={facetHref(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent ${kind === k ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                {t(`discover.kinds.${k}`)}
              </Link>
            ))}
          </nav>
        </form>

        {query ? (
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{t("discover.resultsCount", { count: results.length })}</h2>
            </div>
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("discover.noResults")}
              </div>
            ) : (
              grid(results)
            )}
          </section>
        ) : (
          <>
            {recommended.length > 0 ? (
              <section>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{t("discover.recommended")}</h2>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{t("discover.recommendedHint")}</p>
                {grid(recommended)}
              </section>
            ) : null}

            {collections.map((c) => (
              <section key={c.slug}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{c.label}</h2>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{c.description}</p>
                {grid(c.items)}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import {
  MARKETPLACE_CATEGORIES,
  COMPANY_TEMPLATES,
  averageRating,
  latestVersion,
  categoryForKind,
  getTemplateVisuals,
  type MarketplaceItem,
  type MarketplaceItemKind,
} from "@/lib/marketplace";
import { loadCatalog, loadInstallState } from "@/lib/marketplace/persistence";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  MarketplaceItemCard,
  type DisplayItem,
} from "@/components/marketplace/marketplace-item-card";
import { MarketplaceActions } from "@/components/marketplace/marketplace-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace");
  return { title: t("title") };
}

export default async function MarketplacePage() {
  const t = await getTranslations("marketplace");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [catalog, installState] = await Promise.all([
    loadCatalog(),
    companyId ? loadInstallState(user.id, companyId) : Promise.resolve({}),
  ]);
  const installedIds = new Set(Object.keys(installState));

  // Group live catalog items by kind.
  const byKind: Partial<Record<MarketplaceItemKind, MarketplaceItem[]>> = {};
  for (const item of Object.values(catalog)) {
    (byKind[item.kind] ??= []).push(item);
  }

  function itemToDisplay(it: MarketplaceItem): DisplayItem {
    const r = averageRating(it);
    const lv = latestVersion(it);
    const ver = it.versions.find((v) => v.version === lv);
    return {
      id: it.id,
      icon: categoryForKind(it.kind)?.icon ?? "Sparkles",
      name: it.name,
      description: it.description,
      version: lv,
      ratingAvg: r.count ? r.average : null,
      ratingCount: r.count,
      verification: it.verification,
      workers: [],
      connectors: [],
      dependencies: (ver?.dependencies ?? []).map((d) => d.itemId),
      deploymentMinutes: 3,
      changelog: it.versions
        .slice(0, 5)
        .map((v) => `v${v.version}${v.changelog ? ` — ${v.changelog}` : ` — ${t("changelogInitial")}`}`),
      detailHref:
        it.kind === "workforce" && it.slug.startsWith("worker-")
          ? `/harmony/marketplace/workers/${it.slug.slice("worker-".length)}`
          : undefined,
    };
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8">
        {/* Category quick-nav */}
        <nav aria-label={t("browse")} className="flex flex-wrap gap-2">
          {MARKETPLACE_CATEGORIES.map((c) => (
            <a
              key={c.slug}
              href={`#${c.slug}`}
              className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {c.label}
            </a>
          ))}
        </nav>

        <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          {t("trust")}
        </p>

        {MARKETPLACE_CATEGORIES.map((cat) => {
          const templateItems =
            cat.kind === "company_template"
              ? COMPANY_TEMPLATES.map((tpl) => {
                  const v = getTemplateVisuals(tpl.id);
                  return {
                    display: {
                      id: tpl.id,
                      icon: "Building2",
                      name: tpl.name,
                      description: tpl.summary,
                      version: tpl.version,
                      ratingAvg: null,
                      ratingCount: 0,
                      verification: "verified" as const,
                      workers: tpl.workforce.map((w) => w.role),
                      connectors: tpl.connectors,
                      dependencies: [],
                      deploymentMinutes: Math.max(2, tpl.workforce.length),
                      changelog: [`v${tpl.version} — ${t("changelogInitial")}`],
                      objectives: tpl.objectives,
                      heroColors: v.heroColors,
                      dashboards: v.dashboards,
                      monthlyCost: v.estimatedMonthlyCost,
                      companySize: v.estimatedCompanySize,
                    } satisfies DisplayItem,
                    isTemplate: true,
                    slug: tpl.slug as string | null,
                  };
                })
              : [];
          const dbItems = (byKind[cat.kind] ?? []).map((it) => ({
            display: itemToDisplay(it),
            isTemplate: false,
            slug: null as string | null,
          }));
          const items = [...templateItems, ...dbItems];

          return (
            <section key={cat.slug} id={cat.slug} className="scroll-mt-24">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{cat.label}</h2>
                <span className="text-xs text-muted-foreground">
                  {t("itemsCount", { count: items.length })}
                </span>
              </div>
              <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{cat.description}</p>

              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(({ display, isTemplate, slug }) => (
                    <MarketplaceItemCard
                      key={display.id}
                      item={display}
                      action={
                        isTemplate ? (
                          <Button asChild size="sm" className="w-full">
                            <Link href={`/harmony/build?template=${slug ?? ""}`}>{t("actions.deploy")}</Link>
                          </Button>
                        ) : (
                          <MarketplaceActions
                            companyId={companyId}
                            itemId={display.id}
                            installed={installedIds.has(display.id)}
                          />
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

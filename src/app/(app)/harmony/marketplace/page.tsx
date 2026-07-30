import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import {
  MARKETPLACE_CATEGORIES,
  COMPANY_TEMPLATES,
  getTemplateVisuals,
} from "@/lib/marketplace";
import { loadStorefrontViewModel, toDisplayItem } from "@/lib/marketplace/storefront";
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
  const storefront = await loadStorefrontViewModel(user.id, companyId);

  const byKind = MARKETPLACE_CATEGORIES.reduce<Record<string, DisplayItem[]>>((acc, category) => {
    acc[category.kind] = storefront.visibleItems
      .filter((item) => item.kind === category.kind)
      .map((item) => {
        const mapped = toDisplayItem(item);
        return {
          ...mapped,
          license: item.license,
          workerKey:
            item.kind === "workforce" && item.slug.startsWith("worker-")
              ? item.slug.slice("worker-".length)
              : undefined,
          reviewable: true,
          reviews: item.ratings
            .filter((rt) => rt.comment && rt.comment.trim().length > 0)
            .slice(0, 10)
            .map((rt) => ({ stars: rt.stars, comment: rt.comment as string })),
          changelog: mapped.changelog.length > 0 ? mapped.changelog : [`v${mapped.version} — ${t("changelogInitial")}`],
        };
      });
    return acc;
  }, {});

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace/discover">{t("nav.discover")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace/bundles">{t("nav.bundles")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/harmony/marketplace/publish">Publish</Link>
        </Button>
      </PageHeader>

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

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <p>{t("trust")}</p>
          <p className="mt-1 text-xs">
            {t("browse")}: {storefront.summary.totalVisibleItems} · Installed: {storefront.summary.installedItems} · Collections: {storefront.summary.collections}
          </p>
        </div>

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
            display: it,
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
                          <MarketplaceActions companyId={companyId} itemId={display.id} installed={storefront.installedIds.has(display.id)} />
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

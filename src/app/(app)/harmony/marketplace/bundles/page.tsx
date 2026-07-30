import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { type Bundle, type BundleCategory } from "@/lib/marketplace";
import { loadStorefrontViewModel } from "@/lib/marketplace/storefront";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace");
  return { title: t("bundles.title") };
}

const CAT_COLORS: Record<BundleCategory, [string, string]> = {
  team: ["#4f46e5", "#6366f1"],
  department: ["#0e7490", "#0891b2"],
  industry: ["#b45309", "#d97706"],
  company: ["#6d28d9", "#7c3aed"],
};

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <span key={it} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{it}</span>
        ))}
      </div>
    </div>
  );
}

export default async function MarketplaceBundlesPage() {
  const t = await getTranslations("marketplace");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const storefront = await loadStorefrontViewModel(user.id, companyId);

  function workerNames(bundle: Bundle): string[] {
    return bundle.contents.workers.map((k) => getAiosAgent(k)?.name ?? k);
  }

  return (
    <>
      <PageHeader title={t("bundles.title")} description={t("bundles.subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace">{t("bundles.back")}</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {storefront.bundles.map((bundle) => {
          const [c0, c1] = CAT_COLORS[bundle.category];
          return (
            <Card key={bundle.id} className="flex h-full flex-col overflow-hidden">
              <div
                className="flex h-20 items-end justify-between px-4 py-3"
                style={{ backgroundImage: `linear-gradient(135deg, ${c0}, ${c1})` }}
              >
                <span className="text-lg font-semibold text-white drop-shadow-sm">{bundle.name}</span>
                <Badge variant="secondary" className="text-[10px] capitalize">{t(`bundles.category.${bundle.category}`)}</Badge>
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <p className="text-sm text-muted-foreground">{bundle.summary}</p>

                <div className="flex flex-col gap-2.5">
                  <ChipRow label={t("bundles.workers")} items={workerNames(bundle)} />
                  <ChipRow label={t("bundles.departments")} items={bundle.contents.departments} />
                  <ChipRow label={t("bundles.connectors")} items={bundle.contents.connectors} />
                  <ChipRow label={t("bundles.dashboards")} items={bundle.contents.dashboards} />
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="text-xs text-muted-foreground">{t("bundles.setupTime", { n: bundle.estimatedSetupMinutes })}</span>
                  <Button asChild size="sm">
                    <Link href={`/harmony/build?bundle=${bundle.slug}`}>{t("bundles.deploy")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

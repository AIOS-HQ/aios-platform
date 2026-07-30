import "server-only";

import { getEnvelope } from "@/lib/company/envelope";
import { loadCatalog, loadInstallState, loadGlobalInstallCounts } from "./persistence";
import { averageRating, latestVersion } from "./registry";
import { categoryForKind } from "./categories";
import type { Catalog, MarketplaceItem } from "./types";
import { recommendForProfile, type CompanyProfileSignal, type ProfileRecommendations } from "./intelligence";
import { buildCollections, type Collection } from "./collections";
import { BUNDLES, type Bundle } from "./bundles";
import { searchMarketplace, type DiscoveryResult } from "./discovery";
import type { DisplayItem } from "@/components/marketplace/marketplace-item-card";

/**
 * Server-only storefront context loader for the Marketplace Intelligence Suite
 * surfaces (Discovery, Recommendations, Collections). Composes the RLS-scoped
 * catalog + the company's install-state + global install counts + a
 * `CompanyProfileSignal` derived from the Company Context Envelope, so the pure
 * engines run over live data. Config/knowledge only — never secrets.
 */

export interface StorefrontContext {
  catalog: Catalog;
  signal: CompanyProfileSignal;
  installedIds: Set<string>;
  /** itemId → distinct-company install count (global, counts only). */
  installCounts: Record<string, number>;
}

export interface StorefrontSummary {
  totalVisibleItems: number;
  installedItems: number;
  totalInstallCount: number;
  recommendations: {
    workers: number;
    departments: number;
    skills: number;
    connectors: number;
    dashboards: number;
    workflowPacks: number;
    bundles: number;
    companiesLikeYours: number;
  };
  collections: number;
  bundles: number;
}

export interface StorefrontViewModel {
  catalog: Catalog;
  visibleItems: MarketplaceItem[];
  displayItems: DisplayItem[];
  signal: CompanyProfileSignal;
  installedIds: Set<string>;
  installCounts: Record<string, number>;
  recommendations: ProfileRecommendations;
  collections: Collection[];
  bundles: readonly Bundle[];
  discovery: {
    defaultResult: DiscoveryResult[];
    kinds: MarketplaceItem["kind"][];
    tags: string[];
  };
  summary: StorefrontSummary;
}

export async function loadStorefrontContext(
  userId: string,
  companyId: string | null,
): Promise<StorefrontContext> {
  const [catalog, envelope, installState, installCounts] = await Promise.all([
    loadCatalog(),
    companyId ? getEnvelope(companyId) : Promise.resolve(null),
    companyId ? loadInstallState(userId, companyId) : Promise.resolve({}),
    loadGlobalInstallCounts(),
  ]);
  const installedIds = new Set(Object.keys(installState));
  const signal: CompanyProfileSignal = {
    industry: envelope?.industry ?? null,
    companyType: envelope?.industry ?? null,
    tags: envelope?.coreValues ?? [],
    installedItemIds: [...installedIds],
  };
  return { catalog, signal, installedIds, installCounts };
}

/** Map a live MarketplaceItem to the storefront card's DisplayItem shape. Pure. */
export function toDisplayItem(it: MarketplaceItem): DisplayItem {
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
    changelog: it.versions.slice(0, 5).map((v) => `v${v.version}${v.changelog ? ` — ${v.changelog}` : ""}`),
    detailHref:
      it.kind === "workforce" && it.slug.startsWith("worker-")
        ? `/harmony/marketplace/workers/${it.slug.slice("worker-".length)}`
        : undefined,
  };
}

function uniqueKinds(items: MarketplaceItem[]): MarketplaceItem["kind"][] {
  return Array.from(new Set(items.map((item) => item.kind)));
}

function uniqueTags(items: MarketplaceItem[]): string[] {
  return Array.from(new Set(items.flatMap((item) => item.tags))).sort((left, right) => left.localeCompare(right));
}

export function composeStorefrontViewModel(context: StorefrontContext): StorefrontViewModel {
  const visibleItems = Object.values(context.catalog);
  const displayItems = visibleItems.map(toDisplayItem);
  const recommendations = recommendForProfile(context.signal, context.catalog, 6);
  const collections = buildCollections({
    catalog: context.catalog,
    signal: context.signal,
    installCounts: context.installCounts,
    limit: 12,
  });
  const defaultResult = searchMarketplace("", context.catalog, {});
  const totalInstallCount = Object.values(context.installCounts).reduce((acc, count) => acc + count, 0);

  return {
    catalog: context.catalog,
    visibleItems,
    displayItems,
    signal: context.signal,
    installedIds: context.installedIds,
    installCounts: context.installCounts,
    recommendations,
    collections,
    bundles: BUNDLES,
    discovery: {
      defaultResult,
      kinds: uniqueKinds(visibleItems),
      tags: uniqueTags(visibleItems),
    },
    summary: {
      totalVisibleItems: visibleItems.length,
      installedItems: context.installedIds.size,
      totalInstallCount,
      recommendations: {
        workers: recommendations.workers.length,
        departments: recommendations.departments.length,
        skills: recommendations.skills.length,
        connectors: recommendations.connectors.length,
        dashboards: recommendations.dashboards.length,
        workflowPacks: recommendations.workflowPacks.length,
        bundles: recommendations.bundles.length,
        companiesLikeYours: recommendations.companiesLikeYours.length,
      },
      collections: collections.length,
      bundles: BUNDLES.length,
    },
  };
}

export async function loadStorefrontViewModel(userId: string, companyId: string | null): Promise<StorefrontViewModel> {
  const context = await loadStorefrontContext(userId, companyId);
  return composeStorefrontViewModel(context);
}

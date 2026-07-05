import "server-only";

import { getEnvelope } from "@/lib/company/envelope";
import { loadCatalog, loadInstallState, loadGlobalInstallCounts } from "./persistence";
import { averageRating, latestVersion } from "./registry";
import { categoryForKind } from "./categories";
import type { Catalog, MarketplaceItem } from "./types";
import type { CompanyProfileSignal } from "./intelligence";
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

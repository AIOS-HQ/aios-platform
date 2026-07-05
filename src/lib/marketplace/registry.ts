/**
 * Pure marketplace registry helpers: ratings, listing/visibility, verification
 * policy, and dependency-graph resolution. No I/O — everything operates over an
 * in-memory Catalog so it is fully unit-testable and shared by the public
 * marketplace and company-private catalogs alike.
 */

import type {
  Catalog,
  Dependency,
  MarketplaceItem,
  MarketplaceItemKind,
  PlanStep,
  Visibility,
} from "./types";
import { compareSemver, maxSatisfying } from "./semver";

/** Average star rating + count for an item. */
export function averageRating(item: MarketplaceItem): { average: number; count: number } {
  if (item.ratings.length === 0) return { average: 0, count: 0 };
  const sum = item.ratings.reduce((s, r) => s + r.stars, 0);
  return { average: Math.round((sum / item.ratings.length) * 100) / 100, count: item.ratings.length };
}

/** Non-yanked versions of an item, highest first. */
export function installableVersions(item: MarketplaceItem): string[] {
  return item.versions
    .filter((v) => !v.yanked)
    .map((v) => v.version)
    .sort(compareSemver)
    .reverse();
}

/** The latest installable (non-yanked) version, or null. */
export function latestVersion(item: MarketplaceItem): string | null {
  const vs = installableVersions(item);
  return vs.length ? vs[0] : null;
}

export function listByKind(catalog: Catalog, kind: MarketplaceItemKind): MarketplaceItem[] {
  return Object.values(catalog).filter((i) => i.kind === kind);
}

/**
 * Items a given company may see: all public items plus that company's own
 * private items. Public listing additionally requires the item to be verified.
 */
export function visibleTo(catalog: Catalog, viewerCompanyId: string | null): MarketplaceItem[] {
  return Object.values(catalog).filter((i) => {
    if (i.visibility === ("marketplace_public" as Visibility)) return i.verification === "verified";
    return viewerCompanyId != null && i.companyId === viewerCompanyId;
  });
}

/** Public-marketplace install policy: only verified public items are installable. */
export function isPublicInstallable(item: MarketplaceItem): boolean {
  return item.visibility !== "marketplace_public" || item.verification === "verified";
}

export interface ResolutionResult {
  /** Post-order install steps: every dependency precedes its dependents. */
  order: PlanStep[];
  /** Dependencies that no catalog item / version can satisfy. */
  missing: { itemId: string; range: string }[];
  /** Items required at mutually incompatible versions along the graph. */
  conflicts: { itemId: string; chosen: string; range: string }[];
  /** Dependency cycles detected (list of itemId chains). */
  cycles: string[][];
}

/**
 * Resolve the full dependency closure for installing `rootItemId` at
 * `rootVersion`. Chooses the highest version of each dependency satisfying its
 * range, detects cycles, missing items, and version conflicts. Pure.
 */
export function resolveDependencies(
  catalog: Catalog,
  rootItemId: string,
  rootVersion: string,
): ResolutionResult {
  const chosen = new Map<string, string>(); // itemId -> version
  const order: PlanStep[] = [];
  const missing: { itemId: string; range: string }[] = [];
  const conflicts: { itemId: string; chosen: string; range: string }[] = [];
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();

  function versionsOf(itemId: string): string[] {
    const item = catalog[itemId];
    return item ? item.versions.filter((v) => !v.yanked).map((v) => v.version) : [];
  }

  function depsOf(itemId: string, version: string): Dependency[] {
    const item = catalog[itemId];
    const v = item?.versions.find((x) => x.version === version);
    return v?.dependencies ?? [];
  }

  function visit(itemId: string, version: string, path: string[]): void {
    const item = catalog[itemId];
    if (!item) {
      missing.push({ itemId, range: version });
      return;
    }
    // Conflict: already chosen at a different, incompatible version.
    const prior = chosen.get(itemId);
    if (prior && prior !== version) {
      conflicts.push({ itemId, chosen: prior, range: version });
      return;
    }
    if (done.has(itemId)) return;
    if (visiting.has(itemId)) {
      cycles.push([...path, itemId]);
      return;
    }
    visiting.add(itemId);
    chosen.set(itemId, version);

    for (const dep of depsOf(itemId, version)) {
      const target = maxSatisfying(versionsOf(dep.itemId), dep.range);
      if (!catalog[dep.itemId]) {
        missing.push({ itemId: dep.itemId, range: dep.range });
        continue;
      }
      if (!target) {
        missing.push({ itemId: dep.itemId, range: dep.range });
        continue;
      }
      visit(dep.itemId, target, [...path, itemId]);
    }

    visiting.delete(itemId);
    done.add(itemId);
    order.push({
      itemId,
      kind: item.kind,
      version,
      reason: path.length === 0 ? "requested" : "dependency",
    });
  }

  visit(rootItemId, rootVersion, []);
  return { order, missing, conflicts, cycles };
}

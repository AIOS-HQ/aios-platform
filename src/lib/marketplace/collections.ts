/**
 * Marketplace Collections — curated storefront rows.
 *
 * Pure selectors over an in-memory Catalog (+ optional install counts, favorite
 * / staff-pick id lists, and a company profile signal for AI Recommended). No
 * I/O. A server layer supplies install counts (from the global-counts RPC) and
 * the curated id lists; the storefront renders whatever non-empty rows come
 * back.
 */

import type { Catalog, MarketplaceItem } from "./types";
import { averageRating, isPublicInstallable } from "./registry";
import { recommendForProfile, type CompanyProfileSignal } from "./intelligence";

export interface Collection {
  slug: string;
  label: string;
  description: string;
  items: MarketplaceItem[];
}

export interface CollectionInputs {
  catalog: Catalog;
  /** itemId -> install count (global, from marketplace_install_counts RPC). */
  installCounts?: Record<string, number>;
  /** Founder-curated favorite item ids, in display order. */
  favoriteIds?: string[];
  /** Editorially curated "staff pick" item ids. */
  staffPickIds?: string[];
  /** When present, powers the "AI Recommended" row. */
  signal?: CompanyProfileSignal;
  /** Epoch ms "now" for trending/new recency (injectable for tests). */
  now?: number;
  limit?: number;
}

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NEW_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

function publicPool(catalog: Catalog): MarketplaceItem[] {
  return Object.values(catalog).filter(isPublicInstallable);
}

function byIds(pool: MarketplaceItem[], ids: string[]): MarketplaceItem[] {
  const map = new Map(pool.map((i) => [i.id, i]));
  return ids.map((id) => map.get(id)).filter((i): i is MarketplaceItem => Boolean(i));
}

/**
 * Build the curated collections. Rows with no items are omitted so the
 * storefront never renders an empty shelf.
 */
export function buildCollections(inputs: CollectionInputs): Collection[] {
  const { catalog, installCounts = {}, favoriteIds = [], staffPickIds = [], signal } = inputs;
  const limit = inputs.limit ?? 12;
  const now = inputs.now ?? Date.now();
  const pool = publicPool(catalog);
  const collections: Collection[] = [];

  // Founder Favorites — explicit curation, preserve order.
  const favorites = byIds(pool, favoriteIds).slice(0, limit);
  if (favorites.length) {
    collections.push({
      slug: "founder-favorites",
      label: "Founder Favorites",
      description: "Hand-picked by the founder.",
      items: favorites,
    });
  }

  // AI Recommended — from the intelligence engine, deduped across kinds.
  if (signal) {
    const rec = recommendForProfile(signal, catalog, limit);
    const seen = new Set<string>();
    const items: MarketplaceItem[] = [];
    for (const bucket of [rec.workers, rec.departments, rec.skills, rec.connectors, rec.dashboards, rec.workflowPacks]) {
      for (const it of bucket) {
        if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
      }
    }
    if (items.length) {
      collections.push({
        slug: "ai-recommended",
        label: "AI Recommended",
        description: "Tailored to your company profile.",
        items: items.slice(0, limit),
      });
    }
  }

  // Trending — install volume weighted by recent update activity.
  const trending = [...pool]
    .map((i) => {
      const installs = installCounts[i.id] ?? 0;
      const recent = now - new Date(i.updatedAt).getTime() <= RECENT_WINDOW_MS ? 1 : 0;
      return { i, s: installs * (1 + recent) + recent };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.i);
  if (trending.length) {
    collections.push({
      slug: "trending",
      label: "Trending",
      description: "Gaining momentum right now.",
      items: trending,
    });
  }

  // Highest Rated — rated items only, best average first.
  const highestRated = [...pool]
    .map((i) => ({ i, r: averageRating(i) }))
    .filter((x) => x.r.count > 0)
    .sort((a, b) => b.r.average - a.r.average || b.r.count - a.r.count)
    .slice(0, limit)
    .map((x) => x.i);
  if (highestRated.length) {
    collections.push({
      slug: "highest-rated",
      label: "Highest Rated",
      description: "Loved by the operators who use them.",
      items: highestRated,
    });
  }

  // Most Installed — raw global install volume.
  const mostInstalled = [...pool]
    .filter((i) => (installCounts[i.id] ?? 0) > 0)
    .sort((a, b) => (installCounts[b.id] ?? 0) - (installCounts[a.id] ?? 0))
    .slice(0, limit);
  if (mostInstalled.length) {
    collections.push({
      slug: "most-installed",
      label: "Most Installed",
      description: "The workforce's most-deployed capabilities.",
      items: mostInstalled,
    });
  }

  // New Releases — most recently PUBLISHED (by createdAt), preferring the window.
  const sortedByCreated = [...pool].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const inNewWindow = sortedByCreated.filter((i) => now - new Date(i.createdAt).getTime() <= NEW_WINDOW_MS);
  const newReleases = (inNewWindow.length ? inNewWindow : sortedByCreated).slice(0, limit);
  if (newReleases.length) {
    collections.push({
      slug: "new-releases",
      label: "New Releases",
      description: "Freshly published to the marketplace.",
      items: newReleases,
    });
  }

  // Recently Updated — freshest changes first (by updatedAt).
  const recentlyUpdated = [...pool]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
  if (recentlyUpdated.length) {
    collections.push({
      slug: "recently-updated",
      label: "Recently Updated",
      description: "Shipped or improved lately.",
      items: recentlyUpdated,
    });
  }

  // Staff Picks — explicit editorial list, else verified + strongly rated.
  let staff = byIds(pool, staffPickIds).slice(0, limit);
  if (staff.length === 0) {
    staff = [...pool]
      .map((i) => ({ i, r: averageRating(i) }))
      .filter((x) => x.i.verification === "verified" && x.r.average >= 4.5)
      .sort((a, b) => b.r.average - a.r.average)
      .slice(0, limit)
      .map((x) => x.i);
  }
  if (staff.length) {
    collections.push({
      slug: "staff-picks",
      label: "Staff Picks",
      description: "Standouts worth a look.",
      items: staff,
    });
  }

  return collections;
}

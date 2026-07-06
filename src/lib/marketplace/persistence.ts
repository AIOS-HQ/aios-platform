import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Catalog,
  Dependency,
  InstalledItem,
  InstallState,
  ItemVersion,
  MarketplaceItem,
  MarketplaceItemKind,
  Rating,
  Visibility,
  VerificationStatus,
} from "./types";

/**
 * Marketplace persistence (server-only). Reads the RLS-scoped catalog and a
 * company's installed-state from Postgres and maps DB rows to the pure engine
 * types, so the engine (semver / dependency resolution / install planning) runs
 * over live data exactly as it does over in-memory fixtures. Owner-scoped via
 * RLS (auth.uid() = user_id), with a public-read exception for verified
 * marketplace-public items. Degrades gracefully if the migration is absent.
 *
 * Marketplace rows are configuration/knowledge references ONLY — never secrets.
 */

interface ItemRow {
  id: string;
  user_id: string;
  company_id: string | null;
  kind: MarketplaceItemKind;
  slug: string;
  name: string;
  description: string;
  visibility: Visibility;
  verification: VerificationStatus;
  license: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  item_id: string;
  version: string;
  changelog: string | null;
  checksum: string | null;
  artifact_ref: string | null;
  dependencies: Dependency[] | null;
  min_runtime: string | null;
  yanked: boolean;
  created_at: string;
}

interface RatingRow {
  item_id: string;
  user_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
}

interface InstallationRow {
  item_id: string;
  kind: MarketplaceItemKind;
  installed_version: string;
  source: Visibility;
  enabled: boolean;
  installed_at: string;
}

function toVersion(r: VersionRow): ItemVersion {
  return {
    version: r.version,
    createdAt: r.created_at,
    changelog: r.changelog ?? undefined,
    checksum: r.checksum ?? undefined,
    artifactRef: r.artifact_ref ?? undefined,
    dependencies: Array.isArray(r.dependencies) ? r.dependencies : [],
    minRuntime: r.min_runtime ?? undefined,
    yanked: r.yanked,
  };
}

function toRating(r: RatingRow): Rating {
  return { userId: r.user_id, stars: r.stars, comment: r.comment ?? undefined, createdAt: r.created_at };
}

function toItem(row: ItemRow, versions: ItemVersion[], ratings: Rating[]): MarketplaceItem {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    publisherId: row.user_id,
    companyId: row.company_id ?? undefined,
    visibility: row.visibility,
    verification: row.verification,
    license: row.license ?? undefined,
    versions,
    ratings,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Load the marketplace catalog visible to the user (their own items + verified
 * public items, enforced by RLS), assembled with versions and ratings so the
 * engine can resolve dependencies and compute plans/ratings.
 */
export async function loadCatalog(): Promise<Catalog> {
  const supabase = await createClient();
  const { data: itemData, error } = await supabase.from("marketplace_items").select("*");
  if (error) {
    console.error("[marketplace] loadCatalog items", error.message);
    return {};
  }
  const items = (itemData as ItemRow[] | null) ?? [];
  if (items.length === 0) return {};
  const ids = items.map((i) => i.id);

  const [{ data: versionData }, { data: ratingData }] = await Promise.all([
    supabase.from("marketplace_item_versions").select("*").in("item_id", ids),
    supabase.from("marketplace_item_ratings").select("*").in("item_id", ids),
  ]);
  const versions = (versionData as VersionRow[] | null) ?? [];
  const ratings = (ratingData as RatingRow[] | null) ?? [];

  const catalog: Catalog = {};
  for (const it of items) {
    catalog[it.id] = toItem(
      it,
      versions.filter((v) => v.item_id === it.id).map(toVersion),
      ratings.filter((r) => r.item_id === it.id).map(toRating),
    );
  }
  return catalog;
}

/** Load a single item (with versions + ratings) if visible to the caller. */
export async function loadItem(itemId: string): Promise<MarketplaceItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("marketplace_items").select("*").eq("id", itemId).maybeSingle();
  if (error || !data) return null;
  const row = data as ItemRow;
  const [{ data: versionData }, { data: ratingData }] = await Promise.all([
    supabase.from("marketplace_item_versions").select("*").eq("item_id", itemId),
    supabase.from("marketplace_item_ratings").select("*").eq("item_id", itemId),
  ]);
  return toItem(
    row,
    ((versionData as VersionRow[] | null) ?? []).map(toVersion),
    ((ratingData as RatingRow[] | null) ?? []).map(toRating),
  );
}

/** Load a company's installed-state (owner-scoped). */
export async function loadInstallState(userId: string, companyId: string): Promise<InstallState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_installations")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId);
  if (error) {
    console.error("[marketplace] loadInstallState", error.message);
    return {};
  }
  const rows = (data as InstallationRow[] | null) ?? [];
  const state: InstallState = {};
  for (const r of rows) {
    const installed: InstalledItem = {
      itemId: r.item_id,
      kind: r.kind,
      installedVersion: r.installed_version,
      installedAt: r.installed_at,
      source: r.source,
      enabled: r.enabled,
    };
    state[r.item_id] = installed;
  }
  return state;
}

/**
 * Global install counts across ALL companies (itemId → distinct-company count),
 * via the `marketplace_install_counts` SECURITY DEFINER RPC. That function is
 * the single cross-tenant surface: it returns COUNTS ONLY (no PII, no who), and
 * bypasses RLS solely to aggregate. Powers the Trending / Most Installed
 * storefront collections. Degrades to {} if the function is absent.
 */
export async function loadGlobalInstallCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_install_counts");
  if (error) {
    console.error("[marketplace] loadGlobalInstallCounts", error.message);
    return {};
  }
  const rows = (data as { item_id: string; install_count: number }[] | null) ?? [];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.item_id] = Number(r.install_count);
  return counts;
}

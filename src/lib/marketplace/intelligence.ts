/**
 * Marketplace Intelligence — personalized recommendations by company profile.
 *
 * Pure scoring over an in-memory Catalog + the Company Templates + Bundles. A
 * thin server layer supplies the CompanyProfileSignal (derived from the Company
 * Context Envelope + install state) and the loaded catalog; everything here is
 * side-effect-free and fully unit-testable.
 *
 * Surfaces: recommended AI Workers, Departments, Skills, Connectors, Dashboards,
 * Workflow Packs, "Companies Like Yours", and AI Recommended Bundles.
 */

import type { Catalog, MarketplaceItem, MarketplaceItemKind } from "./types";
import { averageRating, isPublicInstallable, listByKind } from "./registry";
import { COMPANY_TEMPLATES } from "./templates";
import type { CompanyTemplate } from "./templates/types";
import { BUNDLES, type Bundle } from "./bundles";

export interface CompanyProfileSignal {
  industry?: string | null;
  companyType?: string | null;
  size?: string | null;
  tags?: string[];
  /** Provider slugs already wired in the company (config-only). */
  connectors?: string[];
  departments?: string[];
  /** Marketplace item ids already installed — excluded from recommendations. */
  installedItemIds?: string[];
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with",
  "your", "you", "our", "company", "business", "team", "that", "this",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function profileTerms(signal: CompanyProfileSignal): Set<string> {
  const parts: string[] = [];
  if (signal.industry) parts.push(signal.industry);
  if (signal.companyType) parts.push(signal.companyType);
  if (signal.tags) parts.push(...signal.tags);
  if (signal.departments) parts.push(...signal.departments);
  const terms = new Set<string>();
  for (const p of parts) for (const t of tokenize(p)) terms.add(t);
  return terms;
}

function haystack(item: MarketplaceItem): string {
  return `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
}

/** Relevance score of a catalog item to a company profile. Pure. */
export function scoreItemForProfile(item: MarketplaceItem, signal: CompanyProfileSignal): number {
  const terms = profileTerms(signal);
  const hay = haystack(item);
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 2;
  score += averageRating(item).average; // 0..5 popularity/quality signal
  if (item.verification === "verified") score += 1;
  return score;
}

function recommendKinds(
  signal: CompanyProfileSignal,
  catalog: Catalog,
  kinds: MarketplaceItemKind[],
  limit: number,
): MarketplaceItem[] {
  const installed = new Set(signal.installedItemIds ?? []);
  const pool = kinds
    .flatMap((k) => listByKind(catalog, k))
    .filter((i) => isPublicInstallable(i) && !installed.has(i.id));
  return pool
    .map((item) => ({ item, score: scoreItemForProfile(item, signal) }))
    .sort((a, b) => b.score - a.score || averageRating(b.item).average - averageRating(a.item).average)
    .slice(0, limit)
    .map((x) => x.item);
}

export interface ProfileRecommendations {
  workers: MarketplaceItem[];
  departments: MarketplaceItem[];
  skills: MarketplaceItem[];
  connectors: MarketplaceItem[];
  dashboards: MarketplaceItem[];
  workflowPacks: MarketplaceItem[];
  bundles: Bundle[];
  companiesLikeYours: CompanyTemplate[];
}

/** The complete personalized-onboarding recommendation set for a company. */
export function recommendForProfile(
  signal: CompanyProfileSignal,
  catalog: Catalog,
  limit = 6,
): ProfileRecommendations {
  return {
    workers: recommendKinds(signal, catalog, ["workforce"], limit),
    departments: recommendKinds(signal, catalog, ["department"], limit),
    skills: recommendKinds(signal, catalog, ["skill"], limit),
    connectors: recommendKinds(signal, catalog, ["connector"], limit),
    dashboards: recommendKinds(signal, catalog, ["dashboard"], limit),
    workflowPacks: recommendKinds(signal, catalog, ["workflow", "automation"], limit),
    bundles: aiRecommendedBundles(signal, limit),
    companiesLikeYours: companiesLikeYours(signal, limit),
  };
}

/** Company templates most similar to the caller's profile (industry + tags + connectors). */
export function companiesLikeYours(
  signal: CompanyProfileSignal,
  limit = 4,
  templates: readonly CompanyTemplate[] = COMPANY_TEMPLATES,
): CompanyTemplate[] {
  const terms = profileTerms(signal);
  const wired = new Set((signal.connectors ?? []).map((c) => c.toLowerCase()));
  const scored = templates.map((tpl) => {
    let score = 0;
    if (signal.industry && tpl.industry.toLowerCase() === signal.industry.toLowerCase()) score += 5;
    const hay = `${tpl.name} ${tpl.summary} ${tpl.industry} ${tpl.tags.join(" ")}`.toLowerCase();
    for (const t of terms) if (hay.includes(t)) score += 2;
    for (const c of tpl.connectors) if (wired.has(c.toLowerCase())) score += 1;
    return { tpl, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.tpl);
}

/** Bundles best matching the profile; falls back to featured order when nothing matches. */
export function aiRecommendedBundles(
  signal: CompanyProfileSignal,
  limit = 4,
  bundles: readonly Bundle[] = BUNDLES,
): Bundle[] {
  const terms = profileTerms(signal);
  const scored = bundles.map((b) => {
    const hay = `${b.name} ${b.summary} ${b.tags.join(" ")} ${b.category}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 2;
    if (signal.companyType && hay.includes(signal.companyType.toLowerCase())) score += 3;
    if (signal.industry && hay.includes(signal.industry.toLowerCase())) score += 3;
    return { b, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored).slice(0, limit).map((x) => x.b);
}

/**
 * Marketplace Discovery — natural-language + faceted search over the catalog.
 *
 * Pure ranking, no I/O. Supports:
 *  - Natural-language search ("find me a growth team")
 *  - Semantic-ish expansion via an intent-synonym map (no embeddings needed at
 *    this layer; a server layer can blend true embeddings later)
 *  - Capability / connector / department / worker / industry search via filters
 *
 * Operates over an in-memory Catalog so it is fully unit-testable and shared by
 * the public storefront and company-private catalogs.
 */

import type { Catalog, MarketplaceItem, MarketplaceItemKind } from "./types";
import { averageRating, isPublicInstallable } from "./registry";

export interface DiscoveryFilters {
  kinds?: MarketplaceItemKind[];
  industry?: string;
  connector?: string;
  department?: string;
  verifiedOnly?: boolean;
}

export interface DiscoveryResult {
  item: MarketplaceItem;
  score: number;
  matched: string[];
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "me",
  "find", "get", "show", "need", "want", "my", "our", "your", "some", "that",
  "help", "please", "looking", "look", "build", "set", "up", "give",
]);

/** Intent synonym expansion — maps a token to related catalog vocabulary. */
const INTENT_SYNONYMS: Record<string, string[]> = {
  growth: ["growth", "marketing", "acquisition", "demand", "catalyst"],
  marketing: ["marketing", "content", "campaign", "brand", "catalyst"],
  finance: ["finance", "accounting", "revenue", "ledger", "invoice", "bookkeeping"],
  accounting: ["accounting", "finance", "ledger", "bookkeeping"],
  sales: ["sales", "pipeline", "revenue", "crm", "deals", "outreach"],
  support: ["support", "customer", "service", "helpdesk", "ambassador"],
  customer: ["customer", "support", "service", "success"],
  security: ["security", "risk", "compliance", "aegis"],
  compliance: ["compliance", "audit", "risk", "auditor", "ledger"],
  data: ["analytics", "data", "insights", "metrics", "pulse", "dashboard"],
  analytics: ["analytics", "data", "insights", "dashboard", "pulse"],
  team: ["team", "department", "workforce", "staff"],
  hire: ["worker", "agent", "specialist", "workforce"],
  strategy: ["strategy", "planning", "roadmap", "horizon"],
  knowledge: ["knowledge", "docs", "memory", "atlas"],
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Expand query tokens with their intent synonyms into a weighted term set. */
function expandTerms(tokens: string[]): Set<string> {
  const terms = new Set<string>();
  for (const t of tokens) {
    terms.add(t);
    for (const syn of INTENT_SYNONYMS[t] ?? []) terms.add(syn);
  }
  return terms;
}

/**
 * Infer which catalog kinds a free-text query is probably after (e.g. "team" →
 * workforce + department). Empty when no strong signal. Exposed for UI facets.
 */
export function parseIntentKinds(query: string): MarketplaceItemKind[] {
  const tokens = new Set(tokenize(query));
  const kinds = new Set<MarketplaceItemKind>();
  const add = (k: MarketplaceItemKind) => kinds.add(k);
  if (tokens.has("team") || tokens.has("department")) { add("department"); add("workforce"); }
  if (tokens.has("worker") || tokens.has("agent") || tokens.has("hire") || tokens.has("specialist")) add("workforce");
  if (tokens.has("skill") || tokens.has("capability")) add("skill");
  if (tokens.has("connector") || tokens.has("integration")) add("connector");
  if (tokens.has("dashboard") || tokens.has("analytics") || tokens.has("report")) add("dashboard");
  if (tokens.has("workflow") || tokens.has("automation") || tokens.has("automate")) { add("workflow"); add("automation"); }
  if (tokens.has("company") || tokens.has("startup")) add("company_template");
  return [...kinds];
}

function passesFilters(item: MarketplaceItem, filters: DiscoveryFilters): boolean {
  if (filters.verifiedOnly && item.verification !== "verified") return false;
  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(item.kind)) return false;
  const hay = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
  if (filters.industry && !hay.includes(filters.industry.toLowerCase())) return false;
  if (filters.connector && !hay.includes(filters.connector.toLowerCase())) return false;
  if (filters.department && !hay.includes(filters.department.toLowerCase())) return false;
  return true;
}

/**
 * Search the catalog. With a query, ranks by weighted term matches
 * (name×3, tags×2, description×1) blended with rating; with an empty query,
 * returns the filtered pool ordered by rating. Only publicly installable
 * (verified public or private) items are considered.
 */
export function searchMarketplace(
  query: string,
  catalog: Catalog,
  filters: DiscoveryFilters = {},
  limit = 24,
): DiscoveryResult[] {
  const pool = Object.values(catalog).filter((i) => isPublicInstallable(i) && passesFilters(i, filters));
  const tokens = tokenize(query);

  if (tokens.length === 0) {
    return pool
      .map((item) => ({ item, score: averageRating(item).average, matched: [] as string[] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const terms = expandTerms(tokens);
  const results: DiscoveryResult[] = [];
  for (const item of pool) {
    const name = item.name.toLowerCase();
    const tags = item.tags.map((t) => t.toLowerCase());
    const desc = item.description.toLowerCase();
    let score = 0;
    const matched = new Set<string>();
    for (const term of terms) {
      if (name.includes(term)) { score += 3; matched.add(term); }
      if (tags.some((t) => t.includes(term))) { score += 2; matched.add(term); }
      if (desc.includes(term)) { score += 1; matched.add(term); }
    }
    if (score > 0) {
      score += averageRating(item).average * 0.5;
      results.push({ item, score: Math.round(score * 100) / 100, matched: [...matched] });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

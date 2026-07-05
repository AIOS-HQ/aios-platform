/**
 * AIOS Marketplace — core type model (Foundation P15).
 *
 * A single, universal marketplace over the Universal Capability Runtime. Every
 * marketplace surface (AI Workforce, Skills, Departments, Connectors, Workflows,
 * Automations, Dashboards, Industries, Company Templates) is ONE `MarketplaceItem`
 * shape distinguished by `kind` — so versioning, verification, ratings,
 * dependencies, install/update/rollback, and visibility are implemented once and
 * inherited by every catalog.
 *
 * This module is pure types + the pure engine around them (semver, registry,
 * install planning). Persistence (the tables that store items/versions/ratings/
 * installations) is a separate, Founder-gated schema change — the engine here
 * operates over in-memory catalogs and installed-state so it can be fully unit
 * tested and reused by both the public marketplace and a company-private catalog.
 *
 * SECURITY: marketplace artifacts are configuration + knowledge references ONLY.
 * They never carry secrets/tokens — exactly like the Company Context Envelope's
 * connector bindings. Installing a connector item means wiring config; the
 * operator still re-consents credentials in the target company.
 */

/** The nine first-class marketplace catalogs. One shape, distinguished by kind. */
export type MarketplaceItemKind =
  | "workforce" // an AI worker / agent definition
  | "skill" // a reusable capability/skill
  | "department" // a department blueprint (agents + objectives + policies)
  | "connector" // a provider connector config (no tokens)
  | "workflow" // a multi-step orchestrated workflow
  | "automation" // an event/trigger-driven automation
  | "dashboard" // an executive/analytics dashboard template
  | "industry" // an industry pack (bundles tuned for a vertical)
  | "branding_pack" // logo/palette/voice/theme assets
  | "knowledge_pack" // curated knowledge/memory seeds
  | "founder_pack" // founder-experience presets (dashboards + settings + playbooks)
  | "developer_tool" // developer utilities/extensions on the runtime
  | "company_template"; // a full company blueprint

export const MARKETPLACE_ITEM_KINDS: readonly MarketplaceItemKind[] = [
  "workforce",
  "skill",
  "department",
  "connector",
  "workflow",
  "automation",
  "dashboard",
  "industry",
  "branding_pack",
  "knowledge_pack",
  "founder_pack",
  "developer_tool",
  "company_template",
] as const;

/** Where an item lives: within one company, or on the public marketplace. */
export type Visibility = "company_private" | "marketplace_public";

/** Trust state. Only `verified` items may be installed from the public marketplace. */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

/** A dependency on another marketplace item, by id + kind + semver range. */
export interface Dependency {
  itemId: string;
  kind: MarketplaceItemKind;
  /** Semver range the installed dependency must satisfy (e.g. "^1.2.0", ">=2 <3", "*"). */
  range: string;
}

/** One published, immutable version of an item. */
export interface ItemVersion {
  /** Semver string, e.g. "1.4.2" or "2.0.0-beta.1". */
  version: string;
  createdAt: string;
  changelog?: string;
  /** Content hash of the artifact for integrity verification on install. */
  checksum?: string;
  /** Opaque reference to the stored artifact payload (config/knowledge, never secrets). */
  artifactRef?: string;
  dependencies: Dependency[];
  /** Minimum Universal Runtime version required, if any. */
  minRuntime?: string;
  /** A pulled version stays resolvable for rollback but is never newly installed. */
  yanked?: boolean;
}

/** A single user rating (1–5 stars). */
export interface Rating {
  userId: string;
  stars: number;
  comment?: string;
  createdAt: string;
}

/** A marketplace listing: identity + all published versions + social proof. */
export interface MarketplaceItem {
  id: string;
  kind: MarketplaceItemKind;
  slug: string;
  name: string;
  description: string;
  publisherId: string;
  /** Owning company for company-private items; omitted/ignored for public. */
  companyId?: string;
  visibility: Visibility;
  verification: VerificationStatus;
  versions: ItemVersion[];
  ratings: Rating[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** A record that a company has an item installed at a specific version. */
export interface InstalledItem {
  itemId: string;
  kind: MarketplaceItemKind;
  installedVersion: string;
  installedAt: string;
  source: Visibility;
  enabled: boolean;
}

/** Installed-state for one company: itemId -> InstalledItem. */
export type InstallState = Record<string, InstalledItem>;

/** A catalog the engine plans over: itemId -> MarketplaceItem. */
export type Catalog = Record<string, MarketplaceItem>;

export type InstallActionKind = "install" | "update" | "rollback" | "uninstall";

/** One resolved step in an install plan (an item + the version to set). */
export interface PlanStep {
  itemId: string;
  kind: MarketplaceItemKind;
  version: string;
  reason: string;
}

/**
 * The result of planning an install/update/rollback/uninstall. Pure and
 * side-effect-free: the caller (a Founder-gated server action) executes it.
 */
export interface InstallPlan {
  action: InstallActionKind;
  itemId: string;
  fromVersion: string | null;
  toVersion: string | null;
  /** Ordered steps (dependencies first) to apply. Empty when blocked. */
  steps: PlanStep[];
  /** Non-fatal notes (e.g. re-consent connectors, prerelease selected). */
  warnings: string[];
  /** True when the plan cannot proceed; `reasons` explains why. */
  blocked: boolean;
  reasons: string[];
}

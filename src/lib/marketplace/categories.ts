import type { MarketplaceItemKind } from "./types";

/**
 * The AIOS Marketplace's flagship product categories — the storefront face of
 * the engine. Each category maps to a `MarketplaceItemKind` the engine already
 * understands, so versioning/verification/ratings/dependencies/install all work
 * identically across every category. Ordered as they surface in the storefront.
 *
 * `icon` is a lucide icon key resolved by the UI (kept as a string so this pure
 * module never imports React/lucide).
 */
export interface MarketplaceCategory {
  kind: MarketplaceItemKind;
  slug: string;
  label: string;
  description: string;
  icon: string;
}

export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] = [
  {
    kind: "company_template",
    slug: "company-templates",
    label: "Company Templates",
    description: "Deploy a complete autonomous company — Harmony, Julius, Ledger, workforce, and departments — in one install.",
    icon: "Building2",
  },
  {
    kind: "department",
    slug: "ai-departments",
    label: "AI Departments",
    description: "Drop-in departments with their agents, objectives, and policies preconfigured.",
    icon: "Users",
  },
  {
    kind: "workforce",
    slug: "ai-workers",
    label: "AI Workers",
    description: "Individual AI specialists that plug into any company on the Universal Runtime.",
    icon: "Bot",
  },
  {
    kind: "skill",
    slug: "skills",
    label: "Skills",
    description: "Reusable capabilities your workforce can learn and run immediately.",
    icon: "Sparkles",
  },
  {
    kind: "connector",
    slug: "connector-packs",
    label: "Connector Packs",
    description: "Curated provider connectors (config-only) ready to wire onto the runtime.",
    icon: "Plug",
  },
  {
    kind: "workflow",
    slug: "workflow-packs",
    label: "Workflow Packs",
    description: "Multi-step orchestrated workflows that coordinate agents and connectors.",
    icon: "Workflow",
  },
  {
    kind: "dashboard",
    slug: "dashboard-packs",
    label: "Dashboard Packs",
    description: "Executive and operational dashboards tuned to a role or function.",
    icon: "LayoutDashboard",
  },
  {
    kind: "industry",
    slug: "industry-solutions",
    label: "Industry Solutions",
    description: "Vertical bundles — workers, skills, connectors, and dashboards tuned for an industry.",
    icon: "Factory",
  },
  {
    kind: "branding_pack",
    slug: "branding-packs",
    label: "Branding Packs",
    description: "Logo, palette, voice, and theme assets that restyle a company's founder experience.",
    icon: "Palette",
  },
  {
    kind: "knowledge_pack",
    slug: "knowledge-packs",
    label: "Knowledge Packs",
    description: "Curated knowledge and memory seeds that give a company instant institutional context.",
    icon: "BookOpen",
  },
  {
    kind: "founder_pack",
    slug: "founder-packs",
    label: "Founder Packs",
    description: "Founder-experience presets — dashboards, settings, and playbooks for how you run the company.",
    icon: "Crown",
  },
  {
    kind: "developer_tool",
    slug: "developer-tools",
    label: "Developer Tools",
    description: "Extensions and utilities that build on the Universal Capability Runtime.",
    icon: "Wrench",
  },
] as const;

/** The category metadata for a given item kind, if it is a storefront category. */
export function categoryForKind(kind: MarketplaceItemKind): MarketplaceCategory | undefined {
  return MARKETPLACE_CATEGORIES.find((c) => c.kind === kind);
}

/** Category by storefront slug. */
export function categoryBySlug(slug: string): MarketplaceCategory | undefined {
  return MARKETPLACE_CATEGORIES.find((c) => c.slug === slug);
}

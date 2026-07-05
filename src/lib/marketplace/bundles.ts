/**
 * Marketplace Bundles — one-click business functions.
 *
 * A Bundle composes a complete, deployable capability set (AI workers +
 * departments + connectors + dashboards, optionally a full company template)
 * so a Founder can stand up an "Executive Team" or a "Finance Department" in a
 * single action. Pure data + a pure planner: no I/O. The Founder-gated deploy
 * action executes the returned plan (installing workers, wiring config-only
 * connectors for re-consent, provisioning departments/dashboards).
 *
 * Worker keys reference the AIOS Workforce Registry (Mason is founder-only and
 * never appears in a subscriber bundle). Connector/dashboard/department ids are
 * config-only strings — installing wires configuration; credentials are always
 * re-consented in the target company.
 */

import { AIOS_WORKFORCE, isFounderOnlyAgent } from "@/lib/workforce/registry";

export type BundleCategory = "team" | "department" | "industry" | "company";

export interface BundleContents {
  /** AIOS workforce agent keys included in the bundle. */
  workers: string[];
  /** Department blueprint ids provisioned by the bundle. */
  departments: string[];
  /** Provider connector slugs to wire (config-only; re-consent on install). */
  connectors: string[];
  /** Dashboard pack names surfaced by the bundle. */
  dashboards: string[];
  /** Optional reusable skills seeded with the bundle. */
  skills?: string[];
}

export interface Bundle {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: BundleCategory;
  /** lucide icon key resolved by the UI (kept a string so this stays pure). */
  icon: string;
  contents: BundleContents;
  estimatedSetupMinutes: number;
  tags: string[];
}

export const BUNDLES: readonly Bundle[] = [
  {
    id: "bundle-executive-team",
    slug: "executive-team",
    name: "Executive Team",
    summary: "An instant C-suite — coordination, strategy, finance, security, and knowledge — reporting to you.",
    category: "team",
    icon: "Crown",
    contents: {
      workers: ["harmony", "horizon", "ledger", "aegis", "atlas"],
      departments: ["executive"],
      connectors: ["gmail", "slack"],
      dashboards: ["Executive Overview", "Strategy", "Risk"],
    },
    estimatedSetupMinutes: 6,
    tags: ["executive", "leadership", "strategy", "c-suite"],
  },
  {
    id: "bundle-finance-department",
    slug: "finance-department",
    name: "Finance Department",
    summary: "Bookkeeping, compliance, and reporting — a full finance function on day one.",
    category: "department",
    icon: "Landmark",
    contents: {
      workers: ["ledger", "auditor"],
      departments: ["finance"],
      connectors: ["stripe", "quickbooks"],
      dashboards: ["Finance Overview", "Cash Flow", "Compliance"],
      skills: ["invoice-reconciliation", "expense-categorization"],
    },
    estimatedSetupMinutes: 5,
    tags: ["finance", "accounting", "bookkeeping", "compliance", "revenue"],
  },
  {
    id: "bundle-marketing-department",
    slug: "marketing-department",
    name: "Marketing Department",
    summary: "Content, campaigns, and growth experimentation, coordinated end to end.",
    category: "department",
    icon: "Megaphone",
    contents: {
      workers: ["catalyst", "ambassador"],
      departments: ["marketing"],
      connectors: ["linkedin", "google-analytics"],
      dashboards: ["Growth", "Campaigns", "Content Calendar"],
      skills: ["content-generation", "campaign-planning"],
    },
    estimatedSetupMinutes: 5,
    tags: ["marketing", "growth", "content", "campaigns", "brand"],
  },
  {
    id: "bundle-sales-department",
    slug: "sales-department",
    name: "Sales Department",
    summary: "Pipeline, outreach, and revenue tracking with a coordinated sales workforce.",
    category: "department",
    icon: "TrendingUp",
    contents: {
      workers: ["ambassador", "catalyst", "ledger"],
      departments: ["sales"],
      connectors: ["hubspot", "gmail"],
      dashboards: ["Pipeline", "Revenue", "Outreach"],
      skills: ["lead-qualification", "follow-up-sequences"],
    },
    estimatedSetupMinutes: 5,
    tags: ["sales", "pipeline", "revenue", "crm", "outreach"],
  },
  {
    id: "bundle-customer-support",
    slug: "customer-support",
    name: "Customer Support",
    summary: "Omnichannel support and knowledge — greet, triage, resolve, and follow up.",
    category: "department",
    icon: "Headphones",
    contents: {
      workers: ["ambassador", "atlas"],
      departments: ["support"],
      connectors: ["whatsapp", "gmail", "messenger"],
      dashboards: ["Support Queue", "CSAT", "Response Times"],
      skills: ["ticket-triage", "knowledge-answers"],
    },
    estimatedSetupMinutes: 4,
    tags: ["support", "customer", "service", "helpdesk", "success"],
  },
  {
    id: "bundle-healthcare-practice",
    slug: "healthcare-practice",
    name: "Healthcare Practice",
    summary: "Front desk, billing, and compliance tuned for a patient-facing practice.",
    category: "industry",
    icon: "HeartPulse",
    contents: {
      workers: ["harmony", "ambassador", "ledger", "aegis"],
      departments: ["front-desk", "billing", "compliance"],
      connectors: ["gmail"],
      dashboards: ["Appointments", "Billing", "Compliance"],
    },
    estimatedSetupMinutes: 8,
    tags: ["healthcare", "practice", "clinic", "billing", "compliance", "patients"],
  },
  {
    id: "bundle-saas-startup",
    slug: "saas-startup",
    name: "SaaS Startup",
    summary: "A lean, full-stack startup — growth, product ops, finance, and support.",
    category: "company",
    icon: "Rocket",
    contents: {
      workers: ["harmony", "catalyst", "ambassador", "ledger", "pulse", "atlas"],
      departments: ["engineering", "growth", "finance", "support"],
      connectors: ["github", "linkedin", "stripe", "slack"],
      dashboards: ["MRR", "Growth", "Product Ops", "Runway"],
    },
    estimatedSetupMinutes: 10,
    tags: ["saas", "startup", "software", "growth", "product"],
  },
  {
    id: "bundle-law-firm",
    slug: "law-firm",
    name: "Law Firm",
    summary: "Intake, matter billing, and compliance for a modern practice.",
    category: "industry",
    icon: "Scale",
    contents: {
      workers: ["harmony", "ledger", "ambassador", "aegis", "atlas"],
      departments: ["intake", "billing", "compliance"],
      connectors: ["gmail", "outlook"],
      dashboards: ["Matters", "Billing", "Compliance"],
    },
    estimatedSetupMinutes: 8,
    tags: ["legal", "law", "firm", "billing", "compliance", "intake"],
  },
  {
    id: "bundle-restaurant",
    slug: "restaurant",
    name: "Restaurant",
    summary: "Reservations, inventory, and finance for front- and back-of-house.",
    category: "industry",
    icon: "UtensilsCrossed",
    contents: {
      workers: ["harmony", "ambassador", "ledger", "pulse"],
      departments: ["front-of-house", "inventory", "finance"],
      connectors: ["whatsapp", "instagram"],
      dashboards: ["Reservations", "Inventory", "Sales"],
    },
    estimatedSetupMinutes: 7,
    tags: ["restaurant", "hospitality", "food", "reservations", "inventory"],
  },
];

export function getBundle(slug: string): Bundle | undefined {
  return BUNDLES.find((b) => b.slug === slug || b.id === slug);
}

export function listBundlesByCategory(category: BundleCategory): Bundle[] {
  return BUNDLES.filter((b) => b.category === category);
}

export type BundleStepType = "worker" | "department" | "connector" | "dashboard" | "skill";
export interface BundlePlanStep {
  type: BundleStepType;
  ref: string;
  label: string;
  /** "present" when the target already has it; "install" otherwise. */
  status: "install" | "present";
}
export interface BundlePlan {
  bundleId: string;
  slug: string;
  steps: BundlePlanStep[];
  /** Connectors that require credential re-consent in the target company. */
  connectorsToConsent: string[];
  estimatedSetupMinutes: number;
  installCount: number;
}

/**
 * Plan a one-click bundle install for a target company. Pure: marks each piece
 * install-vs-present from the provided current state, and surfaces the
 * connectors that will need re-consent. The Founder-gated action executes it.
 */
export function planBundle(
  bundle: Bundle,
  opts: { installedWorkerKeys?: string[]; presentDepartments?: string[]; wiredConnectors?: string[] } = {},
): BundlePlan {
  const haveWorkers = new Set(opts.installedWorkerKeys ?? []);
  const haveDepts = new Set(opts.presentDepartments ?? []);
  const wired = new Set((opts.wiredConnectors ?? []).map((c) => c.toLowerCase()));
  const steps: BundlePlanStep[] = [];

  for (const w of bundle.contents.workers) {
    steps.push({ type: "worker", ref: w, label: w, status: haveWorkers.has(w) ? "present" : "install" });
  }
  for (const d of bundle.contents.departments) {
    steps.push({ type: "department", ref: d, label: d, status: haveDepts.has(d) ? "present" : "install" });
  }
  for (const c of bundle.contents.connectors) {
    steps.push({ type: "connector", ref: c, label: c, status: wired.has(c.toLowerCase()) ? "present" : "install" });
  }
  for (const d of bundle.contents.dashboards) {
    steps.push({ type: "dashboard", ref: d, label: d, status: "install" });
  }
  for (const s of bundle.contents.skills ?? []) {
    steps.push({ type: "skill", ref: s, label: s, status: "install" });
  }

  const connectorsToConsent = bundle.contents.connectors.filter((c) => !wired.has(c.toLowerCase()));
  const installCount = steps.filter((s) => s.status === "install").length;
  return {
    bundleId: bundle.id,
    slug: bundle.slug,
    steps,
    connectorsToConsent,
    estimatedSetupMinutes: bundle.estimatedSetupMinutes,
    installCount,
  };
}

/** Validate every bundle references real, subscriber-facing worker keys. */
export function validateBundles(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const valid = new Set<string>(AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key)).map((a) => a.key));
  const slugs = new Set<string>();
  for (const b of BUNDLES) {
    if (slugs.has(b.slug)) errors.push(`Duplicate bundle slug: ${b.slug}`);
    slugs.add(b.slug);
    if (b.contents.workers.length === 0) errors.push(`${b.slug}: no workers`);
    for (const w of b.contents.workers) {
      if (!valid.has(w)) errors.push(`${b.slug}: invalid/founder-only worker ${w}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

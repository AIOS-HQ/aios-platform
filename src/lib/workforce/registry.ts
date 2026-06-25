/**
 * Official AIOS Workforce Registry — code source of truth (mirrors WORKFORCE.md).
 *
 * AIOS and AirBid are SEPARATE companies. AirBid agent names are reserved and
 * must never be used for AIOS agents (see AIRBID_RESERVED_NAMES + the guards).
 *
 * Julius is NOT an agent — it is the AIOS organizational brain (see
 * src/lib/julius). Atlas is its primary curator/steward.
 *
 * Pure + dependency-free + client-safe. No secrets, no DB. This formalizes the
 * named workforce in code; the per-company department agents (Coding Agent, etc.)
 * live separately in src/lib/harmony/os/catalog.ts and are unaffected.
 */

// AirBid names live in a SEPARATE registry; AIOS imports them only to block them.
import { AIRBID_RESERVED_NAMES, isReservedAirbidName } from "@/lib/workforce/airbid";

export { AIRBID_RESERVED_NAMES, isReservedAirbidName };

export type AiosAgentKey =
  | "harmony"
  | "auditor"
  | "catalyst"
  | "ambassador"
  | "atlas"
  | "pulse"
  | "horizon"
  | "aegis"
  | "ledger";

/** Julius access level for an agent. `steward` = primary curator (Atlas). */
export type JuliusAccess = "read" | "read_write" | "steward";

export interface AiosAgent {
  key: AiosAgentKey;
  name: string;
  role: string;
  purpose: string;
  responsibilities: string[];
  julius: JuliusAccess;
  /** Prior codename in WORKFORCE.md v1.0, when the directive renamed the agent. */
  aka?: string;
}

export const AIOS_WORKFORCE: readonly AiosAgent[] = [
  {
    key: "harmony",
    name: "Harmony",
    role: "Chief Operating Intelligence",
    purpose: "Coordinate the AIOS workforce.",
    responsibilities: [
      "Task routing",
      "Prioritization",
      "Approval routing",
      "Workforce coordination",
      "Founder alignment",
      "Company oversight",
    ],
    julius: "read_write",
  },
  {
    key: "auditor",
    name: "Auditor",
    role: "Internal Auditor & System Inspector",
    aka: "Verity",
    purpose: "Continuously inspect AIOS health.",
    responsibilities: [
      "Code, repository, and Supabase audits",
      "Deployment validation",
      "Integration and security checks",
      "Operational reports",
    ],
    julius: "read_write",
  },
  {
    key: "catalyst",
    name: "Catalyst",
    role: "Content & Growth",
    purpose: "Support marketing and growth.",
    responsibilities: [
      "Content generation",
      "Blog and social drafts",
      "Campaign planning",
      "Growth experimentation",
    ],
    julius: "read_write",
  },
  {
    key: "ambassador",
    name: "Ambassador",
    role: "Communications & Relations",
    aka: "Signal",
    purpose: "Manage communications and external relationships.",
    responsibilities: [
      "Email drafting",
      "Message routing",
      "Notifications",
      "Publishing coordination",
    ],
    julius: "read_write",
  },
  {
    key: "atlas",
    name: "Atlas",
    role: "Knowledge Intelligence",
    purpose: "Maintain organizational memory and knowledge; steward Julius.",
    responsibilities: [
      "Documentation",
      "Knowledge management",
      "Founder context preservation",
      "Decision history",
      "Julius curation and stewardship",
    ],
    julius: "steward",
  },
  {
    key: "pulse",
    name: "Pulse",
    role: "System Monitoring",
    purpose: "Monitor operational health.",
    responsibilities: [
      "Application, deployment, and database monitoring",
      "Usage monitoring",
      "Alert generation",
    ],
    julius: "read_write",
  },
  {
    key: "horizon",
    name: "Horizon",
    role: "Strategy & Planning",
    purpose: "Support long-term planning.",
    responsibilities: [
      "Roadmaps",
      "Strategic planning",
      "Scenario analysis",
      "Goal tracking",
    ],
    julius: "read_write",
  },
  {
    key: "aegis",
    name: "Aegis",
    role: "Security & Risk",
    purpose: "Protect the platform.",
    responsibilities: [
      "Risk monitoring",
      "Security and permission reviews",
      "Credential safety",
      "Threat identification",
    ],
    julius: "read_write",
  },
  {
    key: "ledger",
    name: "Ledger",
    role: "Records & Compliance",
    purpose: "Maintain operational records.",
    responsibilities: [
      "Approval records",
      "Audit trails",
      "Activity history",
      "Compliance tracking",
    ],
    julius: "read_write",
  },
] as const;

/**
 * Harmony is the AI Chief of Staff — the customer-facing coordinator, NOT a peer
 * specialist. These helpers let the UI present the hierarchy (Harmony above the
 * specialists who work for it) instead of a flat list of equals. `AIOS_WORKFORCE`
 * is left intact for existing consumers.
 */
export const HARMONY_KEY: AiosAgentKey = "harmony";

export function getHarmony(): AiosAgent {
  return AIOS_WORKFORCE.find((a) => a.key === HARMONY_KEY)!;
}

/** The specialist workforce that works FOR Harmony (everyone except Harmony). */
export const WORKFORCE_SPECIALISTS: readonly AiosAgent[] = AIOS_WORKFORCE.filter(
  (a) => a.key !== HARMONY_KEY,
);

/** Julius — the AIOS organizational brain. NOT an agent. */
export const JULIUS = {
  name: "Julius",
  role: "AIOS Organizational Brain",
  isAgent: false,
  steward: "atlas" as AiosAgentKey,
  responsibilities: [
    "organizational memory",
    "historical context",
    "objectives",
    "company knowledge",
    "decisions",
    "documents",
    "activities",
    "relationships between agents",
    "long-term continuity",
  ],
} as const;

export function getAiosAgent(key: string): AiosAgent | undefined {
  return AIOS_WORKFORCE.find((a) => a.key === key);
}

export function isAiosAgentName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return AIOS_WORKFORCE.some((a) => a.name.toLowerCase() === n || a.key === n);
}

/**
 * Connectors each AIOS agent is wired to use, keyed by connector id (see
 * src/lib/integrations/connectors). Surfaces connector awareness in the Founder
 * Command Center. Only lists connectors that are actually implemented — extend
 * as new connectors come online. LinkedIn supports Catalyst (content/growth) and
 * Ambassador (communications/relations).
 */
export const AGENT_CONNECTORS: Partial<Record<AiosAgentKey, string[]>> = {
  catalyst: ["linkedin"],
  ambassador: ["linkedin"],
};

export function getAgentConnectors(key: string): string[] {
  return AGENT_CONNECTORS[key as AiosAgentKey] ?? [];
}

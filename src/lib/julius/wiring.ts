import "server-only";

import { listCompanies } from "@/lib/data/os/companies";
import {
  getJuliusContext,
  listJuliusEntries,
  recordJuliusEntry,
  type JuliusEntry,
  type JuliusKind,
} from "@/lib/julius/service";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Julius wiring — the agent-facing API into the AIOS organizational brain.
 *
 * AIOS agents READ shared context before acting (`juliusRecall`), WRITE relevant
 * work afterward (`juliusRemember`), and stay mutually aware via
 * `getJuliusAwareness` (recent objectives / decisions / activities / knowledge).
 * Everything is company-scoped and owner-private; one company's brain never
 * bleeds into another. Degrades gracefully until the Julius migration is applied.
 */

/** Resolve the founder's primary company id (first available). Null if none. */
export async function resolvePrimaryCompanyId(): Promise<string | null> {
  try {
    const companies = await listCompanies();
    return companies.length > 0 ? companies[0].id : null;
  } catch (e) {
    console.error("[julius/wiring] resolvePrimaryCompanyId", e);
    return null;
  }
}

/** Agent READ: shared Julius context for a company before acting. */
export async function juliusRecall(
  userId: string,
  companyId: string,
  query?: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  return getJuliusContext(userId, companyId, query, limit);
}

/** Agent WRITE: record a memory/decision/objective/activity to the org brain. */
export async function juliusRemember(params: {
  userId: string;
  companyId: string;
  agent: string;
  kind: JuliusKind;
  title: string;
  content: string;
  refs?: Record<string, unknown>;
  importance?: number;
}): Promise<boolean> {
  // Enforce the registry's Julius access policy: read-only agents may recall
  // from the shared brain but never write to it. Agents absent from the registry
  // (e.g. system writers) are allowed; only an explicit "read" level is blocked.
  const access = getAiosAgent(params.agent)?.julius;
  if (access === "read") {
    console.warn(
      `[julius/wiring] write rejected for read-only agent "${params.agent}"`,
    );
    return false;
  }
  const saved = await recordJuliusEntry(params);
  return Boolean(saved);
}

export interface JuliusAwareness {
  objectives: JuliusEntry[];
  decisions: JuliusEntry[];
  activities: JuliusEntry[];
  knowledge: JuliusEntry[];
  total: number;
}

/**
 * Cross-agent awareness: a unified recent view of the org brain so every AIOS
 * agent understands relevant objectives, decisions, and activity from the others.
 */
export async function getJuliusAwareness(
  userId: string,
  companyId: string,
): Promise<JuliusAwareness> {
  const [objectives, decisions, activities, knowledge] = await Promise.all([
    listJuliusEntries(userId, companyId, { kind: "objective", limit: 10 }),
    listJuliusEntries(userId, companyId, { kind: "decision", limit: 10 }),
    listJuliusEntries(userId, companyId, { kind: "activity", limit: 10 }),
    listJuliusEntries(userId, companyId, { kind: "knowledge", limit: 10 }),
  ]);
  return {
    objectives,
    decisions,
    activities,
    knowledge,
    total:
      objectives.length + decisions.length + activities.length + knowledge.length,
  };
}

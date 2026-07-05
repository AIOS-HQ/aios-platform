import "server-only";

import {
  getEnvelope,
  upsertEnvelope,
  type CompanyContextEnvelope,
  type EnvelopeUpsert,
} from "@/lib/company/envelope";
import { listCompanySkills, type CompanySkill } from "@/lib/company-skills/library";
import { listJuliusEntries } from "@/lib/julius/service";
import { juliusRemember } from "@/lib/julius/wiring";

/**
 * Portable AI Workforce (Foundation P8) — export/import a company as data.
 *
 * A company IS its Company Context Envelope + brain (Julius memory) + skills.
 * Export serializes those into a WorkforcePackage; import rehydrates them under
 * a new company_id. SECURITY: packages contain configuration + knowledge ONLY —
 * never secrets/tokens (the envelope's connector bindings are config-only; tokens
 * live encrypted in integration_connections and are NEVER exported). Connectors
 * must be re-consented (re-authorized) in the target org after import.
 *
 * Additive + inert: explicit entry points; no automatic caller. Import writes are
 * owner-scoped (RLS) and only run when invoked.
 */

const PACKAGE_SCHEMA_VERSION = 1;
const MEMORY_KINDS = ["knowledge", "decision", "objective", "activity"] as const;
type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryItem {
  kind: MemoryKind;
  title: string;
  content: string;
}

export interface WorkforcePackage {
  schemaVersion: number;
  exportedAt: string;
  sourceCompanyId: string;
  /** Full envelope snapshot; import re-scopes it to the target company_id. */
  envelope: CompanyContextEnvelope | null;
  skills: CompanySkill[];
  memory: MemoryItem[];
  counts: { skills: number; memory: number };
  /** Explicit reminder that connectors are config-only and need re-consent. */
  note: string;
}

/** Export a company's workforce as a portable, secret-free package. */
export async function exportWorkforce(userId: string, companyId: string): Promise<WorkforcePackage> {
  const envelope = await getEnvelope(companyId);
  const skills = await listCompanySkills(userId, companyId, { limit: 500 });

  const memory: MemoryItem[] = [];
  for (const kind of MEMORY_KINDS) {
    const entries = await listJuliusEntries(userId, companyId, { kind, limit: 200 });
    for (const e of entries) memory.push({ kind, title: e.title, content: e.content });
  }

  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceCompanyId: companyId,
    envelope,
    skills,
    memory,
    counts: { skills: skills.length, memory: memory.length },
    note: "Config + knowledge only. No secrets/tokens. Re-consent connectors in the target org after import.",
  };
}

export interface WorkforceImportResult {
  envelopeRestored: boolean;
  memoryRestored: number;
  skillsInPackage: number;
}

/**
 * Rehydrate a WorkforcePackage under a target company. Restores the envelope
 * (identity/config) and re-seeds memory into the target's Julius brain. Skills
 * ride along inside memory (company_skill knowledge entries); structured skill
 * re-scoring resumes as work recurs. Connectors need re-consent (no tokens moved).
 */
export async function importWorkforce(
  userId: string,
  targetCompanyId: string,
  pkg: WorkforcePackage,
): Promise<WorkforceImportResult> {
  let envelopeRestored = false;
  if (pkg.envelope) {
    const upsert: EnvelopeUpsert = { ...pkg.envelope, companyId: targetCompanyId, userId };
    envelopeRestored = await upsertEnvelope(upsert);  // re-scoped to target
  }

  let memoryRestored = 0;
  for (const item of pkg.memory.slice(0, 500)) {
    const ok = await juliusRemember({
      userId,
      companyId: targetCompanyId,
      agent: "harmony",
      kind: item.kind,
      title: item.title,
      content: item.content,
    }).catch(() => false);
    if (ok) memoryRestored += 1;
  }

  return {
    envelopeRestored,
    memoryRestored,
    skillsInPackage: pkg.skills.length,
  };
}

import "server-only";

import { templateById, instantiateTemplate } from "@/lib/marketplace/templates";
import {
  upsertEnvelope,
  type CompanyObjective,
  type ConnectorBinding,
  type DepartmentDef,
  type EnvelopeUpsert,
  type WorkerActivation,
} from "@/lib/company/envelope";
import { juliusRemember } from "@/lib/julius/wiring";

/**
 * Enterprise auto-provisioning — turn a Company Template into a fully-configured
 * autonomous company on the ONE Universal Runtime (Law 1 + Law 2: the same
 * runtime specializes via configuration, no per-company codebase).
 *
 * Instantiates the blueprint and writes the Company Context Envelope (identity,
 * departments, objectives, branding, connectors [config-only], workforce
 * activations), then seeds the company brain (Julius) with the template's
 * knowledge. Additive + inert: explicit entry point, no automatic caller;
 * owner-scoped via the envelope's RLS. No secrets — connectors are config-only
 * and re-consented after provisioning.
 *
 * Assumes the company row already exists (mirrors `provisionWorkforce`): the
 * caller creates the company, then provisions it from a template.
 */

function slugifyId(prefix: string, value: string, index: number): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${base || index + 1}`;
}

export interface ProvisionFromTemplateResult {
  ok: boolean;
  error?: string;
  templateId?: string;
  companyName?: string;
  departments: number;
  objectives: number;
  workersActivated: number;
  connectorsBound: number;
  knowledgeSeeded: number;
}

/**
 * Provision (or re-provision) a company from a Company Template. Idempotent via
 * the envelope upsert. Returns a summary of what was configured.
 */
export async function provisionCompanyFromTemplate(args: {
  userId: string;
  companyId: string;
  templateId: string;
  companyName?: string;
  autonomyLevel?: number;
}): Promise<ProvisionFromTemplateResult> {
  const { userId, companyId, templateId } = args;

  const template = templateById(templateId);
  if (!template) {
    return {
      ok: false,
      error: `Unknown template ${templateId}`,
      departments: 0,
      objectives: 0,
      workersActivated: 0,
      connectorsBound: 0,
      knowledgeSeeded: 0,
    };
  }

  const inst = instantiateTemplate(template, { companyName: args.companyName ?? template.name });
  const autonomyLevel = args.autonomyLevel ?? 2;

  const departments: DepartmentDef[] = inst.departments.map((name, i) => ({
    id: slugifyId("dept", name, i),
    name,
  }));
  const objectives: CompanyObjective[] = inst.objectives.map((o, i) => ({
    id: `obj-${i + 1}`,
    title: o.title,
    status: "active",
  }));
  const connectors: ConnectorBinding[] = inst.connectors.map((c) => ({
    connectorId: c.provider,
    enabled: false, // config-only; re-consent credentials after provisioning
  }));
  const workforce: WorkerActivation[] = inst.workforce.map((w) => ({
    worker: w.key,
    enabled: true,
    autonomyLevel,
  }));

  const upsert: EnvelopeUpsert = {
    companyId,
    userId,
    companyName: inst.companyName,
    industry: inst.industry,
    brand: { voice: inst.brandingTone },
    departments,
    objectives,
    connectors,
    workforce,
  };

  const ok = await upsertEnvelope(upsert);
  if (!ok) {
    return {
      ok: false,
      error: "Envelope upsert failed",
      templateId,
      companyName: inst.companyName,
      departments: 0,
      objectives: 0,
      workersActivated: 0,
      connectorsBound: 0,
      knowledgeSeeded: 0,
    };
  }

  // Seed the company brain (Julius) with the template's institutional knowledge.
  // Best-effort: a missing brain never blocks provisioning.
  let knowledgeSeeded = 0;
  for (const seed of inst.knowledgeSeeds) {
    const seeded = await juliusRemember({
      userId,
      companyId,
      agent: "harmony",
      kind: "knowledge",
      title: seed.title,
      content: seed.content,
    }).catch(() => false);
    if (seeded) knowledgeSeeded += 1;
  }

  return {
    ok: true,
    templateId,
    companyName: inst.companyName,
    departments: departments.length,
    objectives: objectives.length,
    workersActivated: workforce.length,
    connectorsBound: connectors.length,
    knowledgeSeeded,
  };
}

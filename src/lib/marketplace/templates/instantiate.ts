import type { CompanyTemplate, TemplateInstantiation } from "./types";

/**
 * Instantiate a Company Template into a provisioning draft for a named company.
 * Pure — the (Founder-gated) provisioner maps the draft onto a Company Context
 * Envelope and spins up Harmony/Julius/Ledger/workforce. Connectors are marked
 * config-only (credentials are re-consented after provisioning).
 */
export function instantiateTemplate(
  template: CompanyTemplate,
  opts: { companyName: string },
): TemplateInstantiation {
  const companyName = opts.companyName.trim() || template.name;
  return {
    sourceTemplateId: template.id,
    companyName,
    industry: template.industry,
    departments: [...template.departments],
    workforce: template.workforce.map((w) => ({ ...w })),
    objectives: template.objectives.map((title) => ({ title })),
    connectors: template.connectors.map((provider) => ({ provider, configOnly: true as const })),
    brandingTone: template.brandingTone,
    knowledgeSeeds: template.knowledgeSeeds.map((s) => ({
      title: s.split(":")[0].slice(0, 80),
      content: s,
    })),
  };
}

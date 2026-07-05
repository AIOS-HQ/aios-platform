/**
 * Company Templates — the `company_template` marketplace catalog. A template is
 * a blueprint that provisions a COMPLETE autonomous company on the existing AIOS
 * architecture: departments, an AI workforce, objectives, connector bindings
 * (config-only), branding, and knowledge seeds. Instantiating a template yields
 * a provisioning draft that the (Founder-gated) provisioner maps onto a Company
 * Context Envelope.
 *
 * Pure data + pure instantiation — no I/O, fully testable.
 */

/** An AI worker slot in a template: an archetype role, optionally an AIOS agent key. */
export interface TemplateWorker {
  /** AIOS workforce agent key when it maps to one (e.g. "harmony", "ledger"), else a role id. */
  key: string;
  role: string;
}

export interface CompanyTemplate {
  id: string;
  slug: string;
  name: string;
  industry: string;
  summary: string;
  version: string;
  departments: string[];
  workforce: TemplateWorker[];
  objectives: string[];
  /** Provider slugs to wire as connectors — CONFIG ONLY (no tokens; re-consent on install). */
  connectors: string[];
  brandingTone: string;
  knowledgeSeeds: string[];
  tags: string[];
}

/** The provisioning draft produced by instantiating a template for a named company. */
export interface TemplateInstantiation {
  sourceTemplateId: string;
  companyName: string;
  industry: string;
  departments: string[];
  workforce: TemplateWorker[];
  objectives: { title: string }[];
  connectors: { provider: string; configOnly: true }[];
  brandingTone: string;
  knowledgeSeeds: { title: string; content: string }[];
}

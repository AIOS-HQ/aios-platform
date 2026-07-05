import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  BusinessKpi,
  CompanyBrand,
  CompanyContextEnvelope,
  CompanyObjective,
  ConnectorBinding,
  DepartmentDef,
  HumanWorkforceMember,
  PriorityItem,
  WorkerActivation,
} from "./types";

/**
 * Company Context Envelope persistence — owner-scoped through the RLS server
 * client. One row per company. Additive + inert until a worker/UI reads it.
 */

const COLUMNS =
  "company_id,schema_version,company_name,industry,vision,mission,core_values,brand," +
  "departments,org_structure,objectives,priorities,policies,governance,permissions," +
  "compliance,security_profile,operating_rules,workforce,human_workforce,connectors," +
  "skills,knowledge_ref,founder_preferences,workspace_config,deployment_config," +
  "business_kpis,financial_context,customer_context,product_context,operational_context," +
  "created_at,updated_at";

interface EnvelopeRow {
  company_id: string;
  schema_version: number | null;
  company_name: string | null;
  industry: string | null;
  vision: string | null;
  mission: string | null;
  core_values: string[] | null;
  brand: CompanyBrand | null;
  departments: DepartmentDef[] | null;
  org_structure: Record<string, unknown> | null;
  objectives: CompanyObjective[] | null;
  priorities: PriorityItem[] | null;
  policies: Record<string, unknown> | null;
  governance: Record<string, unknown> | null;
  permissions: unknown[] | null;
  compliance: Record<string, unknown> | null;
  security_profile: Record<string, unknown> | null;
  operating_rules: unknown[] | null;
  workforce: WorkerActivation[] | null;
  human_workforce: HumanWorkforceMember[] | null;
  connectors: ConnectorBinding[] | null;
  skills: unknown[] | null;
  knowledge_ref: string | null;
  founder_preferences: Record<string, unknown> | null;
  workspace_config: Record<string, unknown> | null;
  deployment_config: Record<string, unknown> | null;
  business_kpis: BusinessKpi[] | null;
  financial_context: Record<string, unknown> | null;
  customer_context: Record<string, unknown> | null;
  product_context: Record<string, unknown> | null;
  operational_context: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

function fromRow(row: EnvelopeRow): CompanyContextEnvelope {
  return {
    companyId: row.company_id,
    schemaVersion: row.schema_version ?? 1,
    companyName: row.company_name ?? null,
    industry: row.industry ?? null,
    vision: row.vision ?? null,
    mission: row.mission ?? null,
    coreValues: row.core_values ?? [],
    brand: row.brand ?? {},
    departments: row.departments ?? [],
    orgStructure: row.org_structure ?? {},
    objectives: row.objectives ?? [],
    priorities: row.priorities ?? [],
    policies: row.policies ?? {},
    governance: row.governance ?? {},
    permissions: row.permissions ?? [],
    compliance: row.compliance ?? {},
    securityProfile: row.security_profile ?? {},
    operatingRules: row.operating_rules ?? [],
    workforce: row.workforce ?? [],
    humanWorkforce: row.human_workforce ?? [],
    connectors: row.connectors ?? [],
    skills: row.skills ?? [],
    knowledgeRef: row.knowledge_ref ?? null,
    founderPreferences: row.founder_preferences ?? {},
    workspaceConfig: row.workspace_config ?? {},
    deploymentConfig: row.deployment_config ?? {},
    businessKpis: row.business_kpis ?? [],
    financialContext: row.financial_context ?? {},
    customerContext: row.customer_context ?? {},
    productContext: row.product_context ?? {},
    operationalContext: row.operational_context ?? {},
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function getEnvelope(companyId: string): Promise<CompanyContextEnvelope | null> {
  if (!companyId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_context_envelope")
    .select(COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("[company/envelope] getEnvelope", error.message);
    return null;
  }
  return data ? fromRow(data as unknown as EnvelopeRow) : null;
}

export interface EnvelopeUpsert {
  companyId: string;
  userId: string;
  schemaVersion?: number;
  companyName?: string | null;
  industry?: string | null;
  vision?: string | null;
  mission?: string | null;
  coreValues?: string[];
  brand?: CompanyBrand;
  departments?: DepartmentDef[];
  orgStructure?: Record<string, unknown>;
  objectives?: CompanyObjective[];
  priorities?: PriorityItem[];
  policies?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  permissions?: unknown[];
  compliance?: Record<string, unknown>;
  securityProfile?: Record<string, unknown>;
  operatingRules?: unknown[];
  workforce?: WorkerActivation[];
  humanWorkforce?: HumanWorkforceMember[];
  connectors?: ConnectorBinding[];
  skills?: unknown[];
  knowledgeRef?: string | null;
  founderPreferences?: Record<string, unknown>;
  workspaceConfig?: Record<string, unknown>;
  deploymentConfig?: Record<string, unknown>;
  businessKpis?: BusinessKpi[];
  financialContext?: Record<string, unknown>;
  customerContext?: Record<string, unknown>;
  productContext?: Record<string, unknown>;
  operationalContext?: Record<string, unknown>;
}

export async function upsertEnvelope(input: EnvelopeUpsert): Promise<boolean> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {
    company_id: input.companyId,
    user_id: input.userId,
  };
  const set = (col: string, v: unknown) => {
    if (v !== undefined) row[col] = v;
  };
  set("schema_version", input.schemaVersion);
  set("company_name", input.companyName);
  set("industry", input.industry);
  set("vision", input.vision);
  set("mission", input.mission);
  set("core_values", input.coreValues);
  set("brand", input.brand);
  set("departments", input.departments);
  set("org_structure", input.orgStructure);
  set("objectives", input.objectives);
  set("priorities", input.priorities);
  set("policies", input.policies);
  set("governance", input.governance);
  set("permissions", input.permissions);
  set("compliance", input.compliance);
  set("security_profile", input.securityProfile);
  set("operating_rules", input.operatingRules);
  set("workforce", input.workforce);
  set("human_workforce", input.humanWorkforce);
  set("connectors", input.connectors);
  set("skills", input.skills);
  set("knowledge_ref", input.knowledgeRef);
  set("founder_preferences", input.founderPreferences);
  set("workspace_config", input.workspaceConfig);
  set("deployment_config", input.deploymentConfig);
  set("business_kpis", input.businessKpis);
  set("financial_context", input.financialContext);
  set("customer_context", input.customerContext);
  set("product_context", input.productContext);
  set("operational_context", input.operationalContext);

  const { error } = await supabase
    .from("company_context_envelope")
    .upsert(row, { onConflict: "company_id" });
  if (error) {
    console.error("[company/envelope] upsertEnvelope", error.message);
    return false;
  }
  return true;
}

export type EnvelopeSection =
  | "vision"
  | "mission"
  | "core_values"
  | "brand"
  | "departments"
  | "org_structure"
  | "objectives"
  | "priorities"
  | "policies"
  | "governance"
  | "permissions"
  | "compliance"
  | "security_profile"
  | "operating_rules"
  | "workforce"
  | "human_workforce"
  | "connectors"
  | "skills"
  | "founder_preferences"
  | "workspace_config"
  | "deployment_config"
  | "business_kpis"
  | "financial_context"
  | "customer_context"
  | "product_context"
  | "operational_context";

export async function updateEnvelopeSection(
  companyId: string,
  section: EnvelopeSection,
  value: unknown,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_context_envelope")
    .update({ [section]: value })
    .eq("company_id", companyId);
  if (error) {
    console.error("[company/envelope] updateEnvelopeSection", error.message);
    return false;
  }
  return true;
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CompanyBrand,
  CompanyContextEnvelope,
  CompanyObjective,
  ConnectorBinding,
  DepartmentDef,
  WorkerActivation,
} from "./types";

/**
 * Company Context Envelope persistence — owner-scoped through the RLS server
 * client. One row per company. Additive + inert until a worker/UI reads it.
 */

const COLUMNS =
  "company_id,schema_version,company_name,industry,brand,objectives,departments," +
  "policies,governance,permissions,workforce,connectors,skills,knowledge_ref," +
  "founder_preferences,security_profile,operating_rules,created_at,updated_at";

interface EnvelopeRow {
  company_id: string;
  schema_version: number | null;
  company_name: string | null;
  industry: string | null;
  brand: CompanyBrand | null;
  objectives: CompanyObjective[] | null;
  departments: DepartmentDef[] | null;
  policies: Record<string, unknown> | null;
  governance: Record<string, unknown> | null;
  permissions: unknown[] | null;
  workforce: WorkerActivation[] | null;
  connectors: ConnectorBinding[] | null;
  skills: unknown[] | null;
  knowledge_ref: string | null;
  founder_preferences: Record<string, unknown> | null;
  security_profile: Record<string, unknown> | null;
  operating_rules: unknown[] | null;
  created_at: string | null;
  updated_at: string | null;
}

function fromRow(row: EnvelopeRow): CompanyContextEnvelope {
  return {
    companyId: row.company_id,
    schemaVersion: row.schema_version ?? 1,
    companyName: row.company_name ?? null,
    industry: row.industry ?? null,
    brand: row.brand ?? {},
    objectives: row.objectives ?? [],
    departments: row.departments ?? [],
    policies: row.policies ?? {},
    governance: row.governance ?? {},
    permissions: row.permissions ?? [],
    workforce: row.workforce ?? [],
    connectors: row.connectors ?? [],
    skills: row.skills ?? [],
    knowledgeRef: row.knowledge_ref ?? null,
    founderPreferences: row.founder_preferences ?? {},
    securityProfile: row.security_profile ?? {},
    operatingRules: row.operating_rules ?? [],
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
  brand?: CompanyBrand;
  objectives?: CompanyObjective[];
  departments?: DepartmentDef[];
  policies?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  permissions?: unknown[];
  workforce?: WorkerActivation[];
  connectors?: ConnectorBinding[];
  skills?: unknown[];
  knowledgeRef?: string | null;
  founderPreferences?: Record<string, unknown>;
  securityProfile?: Record<string, unknown>;
  operatingRules?: unknown[];
}

export async function upsertEnvelope(input: EnvelopeUpsert): Promise<boolean> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {
    company_id: input.companyId,
    user_id: input.userId,
  };
  if (input.schemaVersion !== undefined) row.schema_version = input.schemaVersion;
  if (input.companyName !== undefined) row.company_name = input.companyName;
  if (input.industry !== undefined) row.industry = input.industry;
  if (input.brand !== undefined) row.brand = input.brand;
  if (input.objectives !== undefined) row.objectives = input.objectives;
  if (input.departments !== undefined) row.departments = input.departments;
  if (input.policies !== undefined) row.policies = input.policies;
  if (input.governance !== undefined) row.governance = input.governance;
  if (input.permissions !== undefined) row.permissions = input.permissions;
  if (input.workforce !== undefined) row.workforce = input.workforce;
  if (input.connectors !== undefined) row.connectors = input.connectors;
  if (input.skills !== undefined) row.skills = input.skills;
  if (input.knowledgeRef !== undefined) row.knowledge_ref = input.knowledgeRef;
  if (input.founderPreferences !== undefined) row.founder_preferences = input.founderPreferences;
  if (input.securityProfile !== undefined) row.security_profile = input.securityProfile;
  if (input.operatingRules !== undefined) row.operating_rules = input.operatingRules;

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
  | "brand"
  | "objectives"
  | "departments"
  | "policies"
  | "governance"
  | "permissions"
  | "workforce"
  | "connectors"
  | "skills"
  | "founder_preferences"
  | "security_profile"
  | "operating_rules";

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

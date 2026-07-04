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
 * client (never the service-role client). One row per company. Additive + inert
 * until a worker/UI reads it. Degrades gracefully if the table is absent.
 */

const COLUMNS =
  "company_id,schema_version,company_name,industry,brand,objectives,departments," +
  "policies,governance,permissions,workforce,connectors,skills,knowledge_ref," +
  "founder_preferences,security_profile,operating_rules,created_at,updated_at";

type Row = Record<string, unknown>;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function fromRow(r: Row): CompanyContextEnvelope {
  return {
    companyId: String(r.company_id ?? ""),
    schemaVersion: typeof r.schema_version === "number" ? r.schema_version : 1,
    companyName: (r.company_name as string | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    brand: obj(r.brand) as CompanyBrand,
    objectives: arr<CompanyObjective>(r.objectives),
    departments: arr<DepartmentDef>(r.departments),
    policies: obj(r.policies),
    governance: obj(r.governance),
    permissions: arr<unknown>(r.permissions),
    workforce: arr<WorkerActivation>(r.workforce),
    connectors: arr<ConnectorBinding>(r.connectors),
    skills: arr<unknown>(r.skills),
    knowledgeRef: (r.knowledge_ref as string | null) ?? null,
    founderPreferences: obj(r.founder_preferences),
    securityProfile: obj(r.security_profile),
    operatingRules: arr<unknown>(r.operating_rules),
    createdAt: r.created_at as string | undefined,
    updatedAt: r.updated_at as string | undefined,
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
  return data ? fromRow(data as Row) : null;
}

export interface EnvelopeUpsert extends Partial<Omit<CompanyContextEnvelope, "companyId">> {
  companyId: string;
  /** Owner (founder) user id — must equal auth.uid() for the RLS insert/update. */
  userId: string;
}

/** Camel → column mapping for the writable envelope sections. */
function toRow(input: EnvelopeUpsert): Row {
  const row: Row = { company_id: input.companyId, user_id: input.userId };
  const set = (col: string, v: unknown) => {
    if (v !== undefined) row[col] = v;
  };
  set("schema_version", input.schemaVersion);
  set("company_name", input.companyName);
  set("industry", input.industry);
  set("brand", input.brand);
  set("objectives", input.objectives);
  set("departments", input.departments);
  set("policies", input.policies);
  set("governance", input.governance);
  set("permissions", input.permissions);
  set("workforce", input.workforce);
  set("connectors", input.connectors);
  set("skills", input.skills);
  set("knowledge_ref", input.knowledgeRef);
  set("founder_preferences", input.founderPreferences);
  set("security_profile", input.securityProfile);
  set("operating_rules", input.operatingRules);
  return row;
}

export async function upsertEnvelope(input: EnvelopeUpsert): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_context_envelope")
    .upsert(toRow(input), { onConflict: "company_id" });
  if (error) {
    console.error("[company/envelope] upsertEnvelope", error.message);
    return false;
  }
  return true;
}

/** Writable jsonb/scalar section names (server-validated allow-list). */
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

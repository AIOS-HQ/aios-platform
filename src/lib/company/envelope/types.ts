/**
 * Company Context Envelope — the identity layer of every organization in AIOS
 * (Phase 2.1, Foundation 1). Every AI worker derives its behavior from this
 * object; nothing about a company is hardcoded. Mirrors public.company_context_envelope.
 *
 * Extensibility: the composite sections are jsonb-backed, so the envelope grows
 * (vision/mission/values live in brand; compliance in governance; workspace +
 * deployment config in founderPreferences) without a schema change. Richer
 * first-class contexts (financial/customer/product/operational, business KPIs,
 * human workforce) are a planned additive migration + type extension.
 */

export interface CompanyBrand {
  logo?: string;
  palette?: string[];
  voice?: string;
  vision?: string;
  mission?: string;
  coreValues?: string[];
}

export interface CompanyObjective {
  id: string;
  title: string;
  priority?: number;
  status?: "active" | "paused" | "done";
}

export interface DepartmentDef {
  id: string;
  name: string;
  parentId?: string;
}

export interface WorkerActivation {
  worker: string;
  enabled: boolean;
  autonomyLevel?: number;
  config?: Record<string, unknown>;
}

/** Connector binding — CONFIG ONLY. Tokens never live here (they stay encrypted in integration_connections). */
export interface ConnectorBinding {
  connectorId: string;
  scopes?: string[];
  enabled?: boolean;
}

export interface CompanyContextEnvelope {
  companyId: string;
  schemaVersion: number;
  companyName: string | null;
  industry: string | null;
  brand: CompanyBrand;
  objectives: CompanyObjective[];
  departments: DepartmentDef[];
  policies: Record<string, unknown>;
  governance: Record<string, unknown>;
  permissions: unknown[];
  workforce: WorkerActivation[];
  connectors: ConnectorBinding[];
  skills: unknown[];
  knowledgeRef: string | null;
  founderPreferences: Record<string, unknown>;
  securityProfile: Record<string, unknown>;
  operatingRules: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

/** The slice of the envelope a worker begins execution from (Law 5: Context-Aware). */
export interface WorkerContext {
  worker: string;
  companyId: string;
  companyName: string | null;
  industry: string | null;
  brand: CompanyBrand;
  objectives: CompanyObjective[];
  policies: Record<string, unknown>;
  governance: Record<string, unknown>;
  operatingRules: unknown[];
  connectors: ConnectorBinding[];
  enabled: boolean;
  autonomyLevel?: number;
  workerConfig?: Record<string, unknown>;
}

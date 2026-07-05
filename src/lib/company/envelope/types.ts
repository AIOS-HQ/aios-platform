/**
 * Company Context Envelope — the identity layer of every organization in AIOS
 * (Phase 2.1, Foundation 1). Every AI worker derives its behavior from this
 * object; nothing about a company is hardcoded. Mirrors
 * public.company_context_envelope.
 *
 * Composite sections are jsonb-backed so the envelope evolves without breaking
 * changes; `schemaVersion` guards forward-compatibility. This is the COMPLETE
 * section set (identity → operational context).
 */

export interface CompanyBrand {
  logo?: string;
  palette?: string[];
  voice?: string;
}

export interface CompanyObjective {
  id: string;
  title: string;
  priority?: number;
  status?: "active" | "paused" | "done";
}

export interface PriorityItem {
  id: string;
  title: string;
  rank?: number;
}

export interface DepartmentDef {
  id: string;
  name: string;
  parentId?: string;
}

export interface OrgUnit {
  id: string;
  name: string;
  kind?: "division" | "department" | "team";
  parentId?: string;
  leadUserId?: string;
}

export interface HumanWorkforceMember {
  id: string;
  name?: string;
  role?: string;
  departmentId?: string;
  userId?: string;
}

export interface BusinessKpi {
  id: string;
  label: string;
  value?: number | string;
  unit?: string;
  target?: number | string;
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
  // Identity
  companyName: string | null;
  industry: string | null;
  vision: string | null;
  mission: string | null;
  coreValues: string[];
  brand: CompanyBrand;
  // Structure
  departments: DepartmentDef[];
  orgStructure: Record<string, unknown>;
  // Direction
  objectives: CompanyObjective[];
  priorities: PriorityItem[];
  // Governance
  policies: Record<string, unknown>;
  governance: Record<string, unknown>;
  permissions: unknown[];
  compliance: Record<string, unknown>;
  securityProfile: Record<string, unknown>;
  operatingRules: unknown[];
  // Workforce
  workforce: WorkerActivation[];
  humanWorkforce: HumanWorkforceMember[];
  // Capabilities & knowledge
  connectors: ConnectorBinding[];
  skills: unknown[];
  knowledgeRef: string | null;
  // Founder + deployment
  founderPreferences: Record<string, unknown>;
  workspaceConfig: Record<string, unknown>;
  deploymentConfig: Record<string, unknown>;
  // Business context
  businessKpis: BusinessKpi[];
  financialContext: Record<string, unknown>;
  customerContext: Record<string, unknown>;
  productContext: Record<string, unknown>;
  operationalContext: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** The slice of the envelope a worker begins execution from (Law 5: Context-Aware). */
export interface WorkerContext {
  worker: string;
  companyId: string;
  companyName: string | null;
  industry: string | null;
  vision: string | null;
  mission: string | null;
  coreValues: string[];
  brand: CompanyBrand;
  objectives: CompanyObjective[];
  priorities: PriorityItem[];
  policies: Record<string, unknown>;
  governance: Record<string, unknown>;
  compliance: Record<string, unknown>;
  operatingRules: unknown[];
  connectors: ConnectorBinding[];
  enabled: boolean;
  autonomyLevel?: number;
  workerConfig?: Record<string, unknown>;
}

/**
 * AI Workforce Organizational Relationships — the first AIOS Workforce Org Graph.
 *
 * A STATIC, declarative model of how the AIOS workforce relates: who reports to
 * whom, who works with whom, dependencies, data flow, and training/replacement
 * capability. This is distinct from the live A2A operational graph
 * (/harmony/workforce/graph), which shows runtime message flow — this describes
 * the intended organization. Pure + dependency-free (client-safe); no I/O.
 *
 * Founder-only Mason is excluded (never subscriber-facing); Julius is the brain,
 * not an org node.
 */

import { AIOS_WORKFORCE, getAiosAgent, isFounderOnlyAgent } from "@/lib/workforce/registry";

export type RelationType =
  | "reports_to"
  | "works_with"
  | "depends_on"
  | "provides_data_to"
  | "receives_data_from"
  | "can_train"
  | "can_replace";

export const RELATION_TYPES: readonly RelationType[] = [
  "reports_to",
  "works_with",
  "depends_on",
  "provides_data_to",
  "receives_data_from",
  "can_train",
  "can_replace",
] as const;

export interface WorkerRelationships {
  /** Agent key or the sentinel "founder" for the top of the org. */
  reportsTo: string | null;
  worksWith: string[];
  dependsOn: string[];
  providesDataTo: string[];
  receivesDataFrom: string[];
  canTrain: string[];
  canReplace: string[];
}

/** Sentinel node id for the human founder at the top of the org. */
export const FOUNDER_NODE = "founder";

export const WORKER_RELATIONSHIPS: Record<string, WorkerRelationships> = {
  harmony: {
    reportsTo: FOUNDER_NODE,
    worksWith: ["auditor", "catalyst", "ambassador", "atlas", "pulse", "horizon", "aegis", "ledger"],
    dependsOn: ["atlas", "horizon"],
    providesDataTo: ["auditor", "catalyst", "ambassador", "atlas", "pulse", "horizon", "aegis", "ledger"],
    receivesDataFrom: ["auditor", "catalyst", "ambassador", "atlas", "pulse", "horizon", "aegis", "ledger"],
    canTrain: [],
    canReplace: [],
  },
  atlas: {
    reportsTo: "harmony",
    worksWith: ["auditor", "horizon", "ledger"],
    dependsOn: ["pulse"],
    providesDataTo: ["harmony", "horizon", "catalyst"],
    receivesDataFrom: ["auditor", "pulse"],
    canTrain: ["catalyst"],
    canReplace: ["ledger"],
  },
  auditor: {
    reportsTo: "harmony",
    worksWith: ["aegis", "pulse", "atlas"],
    dependsOn: ["pulse"],
    providesDataTo: ["harmony", "aegis", "ledger"],
    receivesDataFrom: ["pulse"],
    canTrain: [],
    canReplace: ["aegis"],
  },
  catalyst: {
    reportsTo: "harmony",
    worksWith: ["ambassador", "horizon"],
    dependsOn: ["atlas"],
    providesDataTo: ["harmony", "ambassador"],
    receivesDataFrom: ["atlas", "horizon"],
    canTrain: [],
    canReplace: [],
  },
  ambassador: {
    reportsTo: "harmony",
    worksWith: ["catalyst", "ledger"],
    dependsOn: ["atlas"],
    providesDataTo: ["harmony", "ledger"],
    receivesDataFrom: ["catalyst", "atlas"],
    canTrain: [],
    canReplace: [],
  },
  pulse: {
    reportsTo: "harmony",
    worksWith: ["auditor", "aegis"],
    dependsOn: [],
    providesDataTo: ["auditor", "aegis", "harmony"],
    receivesDataFrom: [],
    canTrain: [],
    canReplace: ["auditor"],
  },
  horizon: {
    reportsTo: "harmony",
    worksWith: ["atlas", "catalyst"],
    dependsOn: ["atlas", "ledger"],
    providesDataTo: ["harmony", "catalyst"],
    receivesDataFrom: ["atlas", "ledger"],
    canTrain: [],
    canReplace: [],
  },
  aegis: {
    reportsTo: "harmony",
    worksWith: ["auditor", "pulse"],
    dependsOn: ["auditor", "pulse"],
    providesDataTo: ["harmony", "ledger"],
    receivesDataFrom: ["auditor", "pulse"],
    canTrain: [],
    canReplace: ["auditor"],
  },
  ledger: {
    reportsTo: "harmony",
    worksWith: ["atlas", "ambassador"],
    dependsOn: ["atlas"],
    providesDataTo: ["harmony", "aegis"],
    receivesDataFrom: ["ambassador", "atlas"],
    canTrain: [],
    canReplace: ["atlas"],
  },
};

export function getWorkerRelationships(key: string): WorkerRelationships | null {
  return WORKER_RELATIONSHIPS[key] ?? null;
}

export interface OrgNode {
  key: string;
  name: string;
  role: string;
}
export interface OrgEdge {
  from: string;
  to: string;
  type: RelationType;
}
export interface OrgGraph {
  nodes: OrgNode[];
  edges: OrgEdge[];
}

const REL_TO_EDGE: { field: keyof WorkerRelationships; type: RelationType }[] = [
  { field: "worksWith", type: "works_with" },
  { field: "dependsOn", type: "depends_on" },
  { field: "providesDataTo", type: "provides_data_to" },
  { field: "receivesDataFrom", type: "receives_data_from" },
  { field: "canTrain", type: "can_train" },
  { field: "canReplace", type: "can_replace" },
];

/**
 * Build the organizational graph: one node per subscriber-facing worker (plus
 * the founder node), and typed edges from the relationship model. `reports_to`
 * is emitted separately (single target, including the founder).
 */
export function buildOrgGraph(): OrgGraph {
  const workers = AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key));
  const nodes: OrgNode[] = [
    { key: FOUNDER_NODE, name: "Founder", role: "Owner" },
    ...workers.map((a) => ({ key: a.key, name: a.name, role: a.role })),
  ];
  const valid = new Set(nodes.map((n) => n.key));
  const edges: OrgEdge[] = [];

  for (const worker of workers) {
    const rel = WORKER_RELATIONSHIPS[worker.key];
    if (!rel) continue;
    if (rel.reportsTo && valid.has(rel.reportsTo)) {
      edges.push({ from: worker.key, to: rel.reportsTo, type: "reports_to" });
    }
    for (const { field, type } of REL_TO_EDGE) {
      for (const target of rel[field] as string[]) {
        if (valid.has(target)) edges.push({ from: worker.key, to: target, type });
      }
    }
  }
  return { nodes, edges };
}

/** Validate the model: every referenced key resolves to a real worker (or founder). */
export function validateRelationships(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const workerKeys = new Set<string>(AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key)).map((a) => a.key));
  const validTarget = (k: string) => k === FOUNDER_NODE || workerKeys.has(k);

  for (const [key, rel] of Object.entries(WORKER_RELATIONSHIPS)) {
    if (!workerKeys.has(key)) errors.push(`Unknown worker key: ${key}`);
    if (rel.reportsTo && !validTarget(rel.reportsTo)) errors.push(`${key}.reportsTo invalid: ${rel.reportsTo}`);
    for (const { field } of REL_TO_EDGE) {
      for (const t of rel[field] as string[]) {
        if (!validTarget(t)) errors.push(`${key}.${field} invalid: ${t}`);
        if (t === key) errors.push(`${key}.${field} self-reference`);
      }
    }
  }
  // Every subscriber-facing worker should have a relationship entry.
  for (const k of workerKeys) {
    if (!WORKER_RELATIONSHIPS[k]) errors.push(`Missing relationships for worker: ${k}`);
  }
  return { ok: errors.length === 0, errors };
}

export function agentName(key: string): string {
  if (key === FOUNDER_NODE) return "Founder";
  return getAiosAgent(key)?.name ?? key;
}

import "server-only";

import { getEnvelope } from "@/lib/company/envelope";
import { listJuliusEntries } from "@/lib/julius/service";

/**
 * Julius Knowledge Graph (Foundation 4) — a company's organizational model as a
 * typed node/edge graph, projected from the Company Context Envelope + the
 * Julius brain. This is Harmony's structural understanding of the business
 * (the seed of the Digital Twin, F12).
 *
 * Additive + inert: a read-only projection (no new table, no writes). Rebuildable
 * from source at any time, so there is no schema to migrate or drift.
 */

export type GraphNodeType =
  | "company"
  | "department"
  | "objective"
  | "priority"
  | "worker"
  | "person"
  | "connector"
  | "decision"
  | "knowledge";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  rel: string;
}

export interface CompanyKnowledgeGraph {
  companyId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  builtAt: string;
}

export async function buildCompanyKnowledgeGraph(
  userId: string,
  companyId: string,
): Promise<CompanyKnowledgeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addNode = (node: GraphNode) => {
    if (!nodes.some((n) => n.id === node.id)) nodes.push(node);
  };
  const link = (from: string, to: string, rel: string) => {
    edges.push({ from, to, rel });
  };

  const companyNode = `company:${companyId}`;

  const envelope = await getEnvelope(companyId);
  addNode({ id: companyNode, type: "company", label: envelope?.companyName ?? "Company" });

  if (envelope) {
    for (const d of envelope.departments) {
      const id = `department:${d.id}`;
      addNode({ id, type: "department", label: d.name });
      link(companyNode, id, "has_department");
    }
    for (const o of envelope.objectives) {
      const id = `objective:${o.id}`;
      addNode({ id, type: "objective", label: o.title });
      link(companyNode, id, "pursues");
    }
    for (const p of envelope.priorities) {
      const id = `priority:${p.id}`;
      addNode({ id, type: "priority", label: p.title });
      link(companyNode, id, "prioritizes");
    }
    for (const w of envelope.workforce) {
      const id = `worker:${w.worker}`;
      addNode({ id, type: "worker", label: w.worker });
      link(companyNode, id, "employs");
    }
    for (const m of envelope.humanWorkforce) {
      const id = `person:${m.id}`;
      addNode({ id, type: "person", label: m.name ?? m.role ?? m.id });
      link(companyNode, id, "team_member");
      if (m.departmentId) link(id, `department:${m.departmentId}`, "member_of");
    }
    for (const c of envelope.connectors) {
      const id = `connector:${c.connectorId}`;
      addNode({ id, type: "connector", label: c.connectorId });
      link(companyNode, id, "connects");
    }
  }

  const decisions = await listJuliusEntries(userId, companyId, { kind: "decision", limit: 50 });
  for (const e of decisions) {
    const id = `decision:${e.id}`;
    addNode({ id, type: "decision", label: e.title });
    link(companyNode, id, "decided");
  }

  const knowledge = await listJuliusEntries(userId, companyId, { kind: "knowledge", limit: 50 });
  for (const e of knowledge) {
    const id = `knowledge:${e.id}`;
    addNode({ id, type: "knowledge", label: e.title });
    link(companyNode, id, "knows");
  }

  return { companyId, nodes, edges, builtAt: new Date().toISOString() };
}

/** Compact summary of the graph for prompts / dashboards. */
export function summarizeKnowledgeGraph(graph: CompanyKnowledgeGraph): {
  nodeCount: number;
  edgeCount: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  for (const n of graph.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, byType };
}

import "server-only";

import { getEnvelope } from "@/lib/company/envelope";
import { buildCompanyKnowledgeGraph, summarizeKnowledgeGraph } from "@/lib/julius/knowledge-graph";

/**
 * AIOS Digital Twin (Foundation 12) — a continuously-derivable model of the
 * company that Harmony reasons from: organization, direction, connectors,
 * finances, risks, operational health, and the underlying knowledge graph.
 *
 * Additive + inert: a read-model composed from the Company Context Envelope +
 * the Julius knowledge graph. No new table; rebuildable on demand.
 */

export interface DigitalTwin {
  companyId: string;
  organization: {
    name: string | null;
    industry: string | null;
    departments: number;
    humanWorkforce: number;
    aiWorkforce: number;
  };
  direction: { objectives: number; priorities: number };
  connectors: { bound: number };
  finances: Record<string, unknown>;
  risks: unknown[];
  operationalHealth: { activeWorkers: number };
  graph: { nodes: number; edges: number; byType: Record<string, number> };
  builtAt: string;
}

export async function buildDigitalTwin(userId: string, companyId: string): Promise<DigitalTwin> {
  const [envelope, graph] = await Promise.all([
    getEnvelope(companyId),
    buildCompanyKnowledgeGraph(userId, companyId),
  ]);
  const g = summarizeKnowledgeGraph(graph);

  const governance: Record<string, unknown> = envelope?.governance ?? {};
  const risksRaw = governance.risks;
  const risks = Array.isArray(risksRaw) ? risksRaw : [];
  const activeWorkers = envelope ? envelope.workforce.filter((w) => w.enabled).length : 0;

  return {
    companyId,
    organization: {
      name: envelope?.companyName ?? null,
      industry: envelope?.industry ?? null,
      departments: envelope?.departments.length ?? 0,
      humanWorkforce: envelope?.humanWorkforce.length ?? 0,
      aiWorkforce: envelope?.workforce.length ?? 0,
    },
    direction: {
      objectives: envelope?.objectives.length ?? 0,
      priorities: envelope?.priorities.length ?? 0,
    },
    connectors: { bound: envelope?.connectors.length ?? 0 },
    finances: envelope?.financialContext ?? {},
    risks,
    operationalHealth: { activeWorkers },
    graph: { nodes: g.nodeCount, edges: g.edgeCount, byType: g.byType },
    builtAt: new Date().toISOString(),
  };
}

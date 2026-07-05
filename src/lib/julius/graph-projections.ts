import type { CompanyKnowledgeGraph, GraphNodeType } from "./knowledge-graph";

/**
 * Julius Knowledge Graph — typed sub-graph projections (Foundation 4 expansion).
 * Filtered views over the full company graph: decision graph, skills graph,
 * organization graph, connector graph. Pure; the company node is always retained
 * as the anchor so each projection stays connected. Feeds institutional-
 * intelligence + semantic-reasoning surfaces.
 */

export function subgraphByTypes(
  graph: CompanyKnowledgeGraph,
  types: GraphNodeType[],
): CompanyKnowledgeGraph {
  const allow = new Set<GraphNodeType>([...types, "company"]);
  const keep = new Set(graph.nodes.filter((n) => allow.has(n.type)).map((n) => n.id));
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

export function decisionGraph(graph: CompanyKnowledgeGraph): CompanyKnowledgeGraph {
  return subgraphByTypes(graph, ["decision"]);
}

export function skillsGraph(graph: CompanyKnowledgeGraph): CompanyKnowledgeGraph {
  return subgraphByTypes(graph, ["knowledge"]);
}

export function organizationGraph(graph: CompanyKnowledgeGraph): CompanyKnowledgeGraph {
  return subgraphByTypes(graph, ["department", "worker", "person"]);
}

export function connectorGraph(graph: CompanyKnowledgeGraph): CompanyKnowledgeGraph {
  return subgraphByTypes(graph, ["connector"]);
}

export function objectiveGraph(graph: CompanyKnowledgeGraph): CompanyKnowledgeGraph {
  return subgraphByTypes(graph, ["objective", "priority"]);
}

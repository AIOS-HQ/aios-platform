import type { CompanyKnowledgeGraph, GraphNode, GraphNodeType } from "./knowledge-graph";

/**
 * Julius Knowledge Graph — reasoning + query layer (Foundation 4 expansion).
 * Pure traversal/search over a CompanyKnowledgeGraph so Harmony (and any worker)
 * can reason structurally: neighbors, related entities, shortest relationship
 * paths, type filters, and label search (the seed of graph-grounded reasoning +
 * semantic retrieval). No I/O.
 */

export function nodeById(graph: CompanyKnowledgeGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function nodesByType(graph: CompanyKnowledgeGraph, type: GraphNodeType): GraphNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

export interface Neighbor {
  node: GraphNode;
  rel: string;
  direction: "out" | "in";
}

/** Direct neighbors of a node (both edge directions). */
export function neighbors(graph: CompanyKnowledgeGraph, nodeId: string): Neighbor[] {
  const out: Neighbor[] = [];
  for (const e of graph.edges) {
    if (e.from === nodeId) {
      const node = nodeById(graph, e.to);
      if (node) out.push({ node, rel: e.rel, direction: "out" });
    } else if (e.to === nodeId) {
      const node = nodeById(graph, e.from);
      if (node) out.push({ node, rel: e.rel, direction: "in" });
    }
  }
  return out;
}

/** All nodes reachable within `depth` hops (BFS, undirected), excluding the seed. */
export function relatedTo(graph: CompanyKnowledgeGraph, nodeId: string, depth = 1): GraphNode[] {
  const seen = new Set<string>([nodeId]);
  let frontier: string[] = [nodeId];
  const result: GraphNode[] = [];
  for (let d = 0; d < depth; d += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighbors(graph, id)) {
        if (!seen.has(nb.node.id)) {
          seen.add(nb.node.id);
          result.push(nb.node);
          next.push(nb.node.id);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return result;
}

/** Case-insensitive label/type search (lightweight semantic-ish retrieval). */
export function searchNodes(graph: CompanyKnowledgeGraph, query: string): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return graph.nodes.filter(
    (n) => n.label.toLowerCase().includes(q) || n.type.includes(q),
  );
}

/** Shortest relationship path (node ids) between two nodes, or null. BFS, undirected. */
export function findPath(
  graph: CompanyKnowledgeGraph,
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return [fromId];
  const prev = new Map<string, string>();
  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const nb of neighbors(graph, current)) {
      if (seen.has(nb.node.id)) continue;
      seen.add(nb.node.id);
      prev.set(nb.node.id, current);
      if (nb.node.id === toId) {
        const path = [toId];
        let step = toId;
        while (prev.has(step)) {
          step = prev.get(step) as string;
          path.unshift(step);
        }
        return path;
      }
      queue.push(nb.node.id);
    }
  }
  return null;
}

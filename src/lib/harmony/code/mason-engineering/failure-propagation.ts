import type { ArchitectureGraph, FailurePropagationPath } from "./types";

const MAX_PROPAGATION_DEPTH = 4;
const MAX_PROPAGATION_PATHS = 30;

export function analyzeFailurePropagation(
  graph: ArchitectureGraph,
  sourceSubsystemId: string,
): FailurePropagationPath[] {
  if (!graph.nodes.some((node) => node.id === sourceSubsystemId)) return [];

  const paths: FailurePropagationPath[] = [];
  const queue: { current: string; downstream: string[]; evidence: string[] }[] = [
    { current: sourceSubsystemId, downstream: [], evidence: [] },
  ];

  while (queue.length > 0 && paths.length < MAX_PROPAGATION_PATHS) {
    const state = queue.shift()!;
    if (state.downstream.length >= MAX_PROPAGATION_DEPTH) continue;
    const consumers = graph.edges
      .filter((edge) => edge.to === state.current && !state.downstream.includes(edge.from) && edge.from !== sourceSubsystemId)
      .sort((left, right) => left.from.localeCompare(right.from));

    for (const edge of consumers) {
      const downstream = [...state.downstream, edge.from];
      const evidence = [...new Set([...state.evidence, ...edge.repositoryEvidence])].sort();
      paths.push({ sourceSubsystemId, downstreamSubsystemIds: downstream, depth: downstream.length, repositoryEvidence: evidence });
      if (paths.length >= MAX_PROPAGATION_PATHS) break;
      queue.push({ current: edge.from, downstream, evidence });
    }
  }

  return paths;
}

import type { ArchitectureDependencyPath, ArchitectureGraph } from "./types";

const MAX_DEPENDENCY_DEPTH = 4;
const MAX_DEPENDENCY_PATHS = 30;

export function traverseArchitectureDependencies(
  graph: ArchitectureGraph,
  sourceSubsystemId: string,
): ArchitectureDependencyPath[] {
  if (!graph.nodes.some((node) => node.id === sourceSubsystemId)) return [];
  const paths: ArchitectureDependencyPath[] = [];
  const queue: { current: string; dependencies: string[]; evidence: string[] }[] = [
    { current: sourceSubsystemId, dependencies: [], evidence: [] },
  ];

  while (queue.length > 0 && paths.length < MAX_DEPENDENCY_PATHS) {
    const state = queue.shift()!;
    if (state.dependencies.length >= MAX_DEPENDENCY_DEPTH) continue;
    const dependencies = graph.edges
      .filter((edge) => edge.from === state.current && !state.dependencies.includes(edge.to) && edge.to !== sourceSubsystemId)
      .sort((left, right) => left.to.localeCompare(right.to));
    for (const edge of dependencies) {
      const dependencyPath = [...state.dependencies, edge.to];
      const evidence = [...new Set([...state.evidence, ...edge.repositoryEvidence])].sort();
      paths.push({
        sourceSubsystemId,
        dependencySubsystemIds: dependencyPath,
        depth: dependencyPath.length,
        repositoryEvidence: evidence,
      });
      if (paths.length >= MAX_DEPENDENCY_PATHS) break;
      queue.push({ current: edge.to, dependencies: dependencyPath, evidence });
    }
  }
  return paths;
}

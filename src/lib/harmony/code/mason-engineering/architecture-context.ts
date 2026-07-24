import { calculateArchitectureConfidence } from "./architecture-confidence";
import { analyzeFailurePropagation } from "./failure-propagation";
import type {
  ArchitectureContextPackage,
  ArchitectureImpactAnalysis,
  ArchitecturalIntelligence,
} from "./types";

function stableId(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createArchitectureContextPackage(input: {
  engineeringContextId: string;
  intelligence: ArchitecturalIntelligence;
  impactAnalysis: ArchitectureImpactAnalysis;
}): ArchitectureContextPackage {
  const repositoryEvidence = [...new Set(input.intelligence.graph.nodes.flatMap((node) => node.repositoryEvidence))].sort();
  const failurePropagation = input.impactAnalysis.affectedSubsystems
    .flatMap((subsystemId) => analyzeFailurePropagation(input.intelligence.graph, subsystemId));
  const identity = JSON.stringify({
    engineeringContextId: input.engineeringContextId,
    nodes: input.intelligence.graph.nodes.map((node) => node.id),
    edges: input.intelligence.graph.edges.map((edge) => `${edge.from}:${edge.to}:${edge.type}`),
    impacted: input.impactAnalysis.affectedSubsystems,
  });

  return {
    schemaVersion: "1.0",
    contextId: `mason-architecture-${stableId(identity)}`,
    architecturalGraph: input.intelligence.graph,
    subsystemProfiles: input.intelligence.subsystemProfiles,
    dependencyGraph: input.intelligence.graph.edges,
    dependencyPaths: input.intelligence.dependencyPaths,
    ownership: input.intelligence.subsystemProfiles.map((profile) => ({ subsystemId: profile.id, owner: profile.owner })),
    criticalPaths: input.intelligence.criticalPaths,
    protectedBoundaries: input.intelligence.boundaries.filter((boundary) => boundary.safetyLevel !== "standard"),
    failurePropagation,
    criticality: input.intelligence.graph.nodes.map((node) => ({ subsystemId: node.id, level: node.criticality })),
    architectureUnknowns: [...input.intelligence.unknowns, ...input.impactAnalysis.unknowns],
    repositoryEvidence,
    impactAnalysis: input.impactAnalysis,
    architectureConfidence: calculateArchitectureConfidence(input.intelligence),
  };
}

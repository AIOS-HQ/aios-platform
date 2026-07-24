import type { ArchitectureConfidenceScore, ArchitecturalIntelligence } from "./types";

function ratio(count: number, total: number, maximum: number): number {
  return total === 0 ? 0 : Math.round(Math.min(1, count / total) * maximum);
}

export function calculateArchitectureConfidence(
  intelligence: ArchitecturalIntelligence,
): ArchitectureConfidenceScore {
  const profiles = intelligence.subsystemProfiles;
  const total = profiles.length;
  const verifiedOwnership = ratio(profiles.filter((profile) => profile.owner).length, total, 15);
  const verifiedDependencies = ratio(profiles.filter((profile) => profile.dependsOn.length + profile.usedBy.length > 0).length, total, 20);
  const verifiedBoundaries = ratio(intelligence.boundaries.filter((boundary) =>
    boundary.publicInterfaces.length + boundary.internalImplementation.length + boundary.protectedSurfaces.length > 0).length, total, 15);
  const verifiedTests = ratio(profiles.filter((profile) => profile.relatedTests.length > 0).length, total, 15);
  const verifiedWorkflows = ratio(profiles.filter((profile) => profile.relatedWorkflows.length > 0).length, total, 10);
  const verifiedRoutes = ratio(profiles.filter((profile) => profile.routes.length + profile.apis.length > 0).length, total, 10);
  const verifiedRuntimeConnections = ratio(intelligence.graph.edges.length, Math.max(1, total), 15);
  const unknownPenalty = Math.min(25, intelligence.unknowns.length * 3);
  const score = Math.max(0, Math.min(100,
    verifiedOwnership + verifiedDependencies + verifiedBoundaries + verifiedTests +
    verifiedWorkflows + verifiedRoutes + verifiedRuntimeConnections - unknownPenalty));

  return {
    score,
    scale: 100,
    method: "measurable_architecture_evidence_v1",
    breakdown: {
      verifiedOwnership,
      verifiedDependencies,
      verifiedBoundaries,
      verifiedTests,
      verifiedWorkflows,
      verifiedRoutes,
      verifiedRuntimeConnections,
      unknownPenalty,
    },
  };
}

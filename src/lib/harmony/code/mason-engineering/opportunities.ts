import type { ArchitecturalIntelligence, EngineeringOpportunity } from "./types";

export function identifyEngineeringOpportunities(
  intelligence: ArchitecturalIntelligence,
): EngineeringOpportunity[] {
  const opportunities: EngineeringOpportunity[] = [];

  for (const profile of intelligence.subsystemProfiles) {
    const coupling = profile.dependsOn.length + profile.usedBy.length;
    if (coupling >= 5 && profile.repositoryEvidence.length > 0) {
      opportunities.push({
        category: "high_coupling",
        affectedSubsystem: profile.id,
        repositoryEvidence: profile.repositoryEvidence,
        estimatedImpact: profile.criticality >= 4 ? "high" : "medium",
        estimatedComplexity: "medium",
        confidence: Math.min(0.95, 0.65 + coupling * 0.04),
        recommendation: "Review coupling before future changes and preserve the verified dependency boundaries.",
      });
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of intelligence.graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  for (const node of intelligence.graph.nodes) {
    const direct = new Set(adjacency.get(node.id) ?? []);
    for (const dependency of direct) {
      if ((adjacency.get(dependency) ?? []).includes(node.id)) {
        const evidence = intelligence.graph.edges
          .filter((edge) => (edge.from === node.id && edge.to === dependency) || (edge.from === dependency && edge.to === node.id))
          .flatMap((edge) => edge.repositoryEvidence);
        opportunities.push({
          category: "circular_dependency",
          affectedSubsystem: node.id,
          repositoryEvidence: [...new Set(evidence)].sort(),
          estimatedImpact: "high",
          estimatedComplexity: "high",
          confidence: 0.95,
          recommendation: "Review the verified two-way dependency and introduce a stable interface only if behavior requires decoupling.",
        });
      }
    }
  }

  return opportunities
    .filter((opportunity, index, all) => all.findIndex((candidate) =>
      candidate.category === opportunity.category && candidate.affectedSubsystem === opportunity.affectedSubsystem) === index)
    .sort((left, right) => `${left.category}:${left.affectedSubsystem}`.localeCompare(`${right.category}:${right.affectedSubsystem}`));
}

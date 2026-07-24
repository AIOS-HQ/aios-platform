import type {
  ArchitectureImpactAnalysis,
  ArchitectureSubsystemEvidence,
  ArchitecturalIntelligence,
  RepositoryIntelligence,
} from "./types";

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function analyzeArchitectureImpact(input: {
  objective: string;
  repositoryIntelligence: RepositoryIntelligence;
  architecturalIntelligence: ArchitecturalIntelligence;
  architectureEvidence: readonly ArchitectureSubsystemEvidence[];
}): ArchitectureImpactAnalysis {
  const terms = new Set(input.repositoryIntelligence.objectiveTerms);
  const relatedPaths = new Set(input.repositoryIntelligence.relatedFiles);
  const matchedEvidence = input.architectureEvidence.filter((subsystem) => {
    const text = [subsystem.id, subsystem.name, subsystem.purpose, ...subsystem.responsibilities]
      .join(" ").toLowerCase();
    return subsystem.evidencePaths.some((path) => relatedPaths.has(path)) ||
      [...terms].some((term) => text.includes(term));
  });
  const supportedIds = new Set(input.architecturalIntelligence.graph.nodes.map((node) => node.id));
  const impacted = matchedEvidence.filter((subsystem) => supportedIds.has(subsystem.id));
  const unknowns = impacted.length === 0 ? [{
    field: "affected_subsystems",
    reason: "No subsystem impact is supported by the bounded repository and architecture evidence.",
  }] : [];

  return {
    affectedFiles: input.repositoryIntelligence.affectedFiles,
    affectedSubsystems: unique(impacted.map((subsystem) => subsystem.id)),
    affectedApis: unique(impacted.flatMap((subsystem) => subsystem.apis ?? [])),
    affectedRoutes: unique(impacted.flatMap((subsystem) => subsystem.routes ?? [])),
    affectedTests: unique(impacted.flatMap((subsystem) => subsystem.relatedTests ?? [])),
    affectedWorkflows: unique(impacted.flatMap((subsystem) => subsystem.relatedWorkflows ?? [])),
    affectedAgents: unique(impacted.flatMap((subsystem) => subsystem.agentKeys ?? [])),
    affectedDatabaseObjects: unique(impacted.flatMap((subsystem) => subsystem.databaseObjects ?? [])),
    affectedRuntimeServices: unique(impacted.flatMap((subsystem) => subsystem.runtimeServices ?? [])),
    unknowns,
    repositoryEvidence: unique(impacted.flatMap((subsystem) => subsystem.evidencePaths)),
  };
}

import { analyzeFailurePropagation } from "./failure-propagation";
import { traverseArchitectureDependencies } from "./dependency-analysis";
import type {
  ArchitectureBoundary,
  ArchitectureCriticalityLevel,
  ArchitectureGraph,
  ArchitectureSubsystemEvidence,
  ArchitectureSubsystemProfile,
  ArchitectureUnknown,
  ArchitecturalIntelligence,
} from "./types";

const MAX_SUBSYSTEMS = 30;
const MAX_EDGES = 80;
const MAX_VALUES = 40;

function validPath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith("/") && !path.includes("\\") &&
    !path.split("/").includes("..");
}

function unique(values: readonly string[] | undefined, limit = MAX_VALUES): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

export function classifySubsystemCriticality(
  evidence: ArchitectureSubsystemEvidence,
): ArchitectureCriticalityLevel {
  const signals = new Set(evidence.criticalitySignals);
  if (signals.has("authentication_boundary") || signals.has("financial_transaction") || signals.has("production_execution")) return 5;
  if (signals.has("authorization_boundary") || signals.has("persistent_data") || signals.has("runtime_orchestration")) return 4;
  if (signals.has("workflow_dependency")) return 3;
  if (signals.has("supporting_service")) return 2;
  return 1;
}

function boundaryFor(
  evidence: ArchitectureSubsystemEvidence,
  criticality: ArchitectureCriticalityLevel,
): ArchitectureBoundary {
  return {
    subsystemId: evidence.id,
    publicInterfaces: unique(evidence.publicInterfaces),
    internalImplementation: unique(evidence.internalInterfaces),
    protectedSurfaces: unique(evidence.protectedComponents),
    externalDependencies: unique(evidence.externalDependencies),
    safetyLevel: criticality === 5 ? "restricted" : criticality >= 3 || (evidence.protectedComponents?.length ?? 0) > 0
      ? "protected"
      : "standard",
    repositoryEvidence: unique(evidence.evidencePaths.filter(validPath)),
  };
}

function unknownsFor(evidence: ArchitectureSubsystemEvidence): ArchitectureUnknown[] {
  const unknowns = unique(evidence.knownUnknowns).map((reason) => ({
    field: "architecture_relationship",
    subsystemId: evidence.id,
    reason,
  }));
  if (!evidence.owner) unknowns.push({ field: "owner", subsystemId: evidence.id, reason: "Subsystem ownership is not proven." });
  if (evidence.evidencePaths.filter(validPath).length === 0) {
    unknowns.push({ field: "repository_evidence", subsystemId: evidence.id, reason: "No safe repository evidence path supports this subsystem." });
  }
  return unknowns;
}

export function createArchitecturalIntelligence(
  evidenceSnapshot: readonly ArchitectureSubsystemEvidence[],
): ArchitecturalIntelligence {
  const bounded = evidenceSnapshot.slice(0, MAX_SUBSYSTEMS);
  const safe = bounded.filter((item) => item.id.trim() && item.name.trim() && item.evidencePaths.some(validPath));
  const ids = new Set(safe.map((item) => item.id));
  const nodes = safe.map((item) => ({
    id: item.id,
    name: item.name,
    layer: item.layer,
    criticality: classifySubsystemCriticality(item),
    repositoryEvidence: unique(item.evidencePaths.filter(validPath)),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const edges = safe.flatMap((item) => item.dependsOn
    .filter((dependency) => ids.has(dependency.subsystemId))
    .map((dependency) => ({
      from: item.id,
      to: dependency.subsystemId,
      type: dependency.type,
      repositoryEvidence: unique(dependency.evidencePaths.filter(validPath)),
    })))
    .filter((edge) => edge.repositoryEvidence.length > 0)
    .sort((left, right) => `${left.from}:${left.to}:${left.type}`.localeCompare(`${right.from}:${right.to}:${right.type}`))
    .slice(0, MAX_EDGES);
  const graph: ArchitectureGraph = { nodes, edges };
  const subsystemProfiles: ArchitectureSubsystemProfile[] = safe.map((item) => {
    const node = nodes.find((candidate) => candidate.id === item.id)!;
    return {
      id: item.id,
      name: item.name,
      purpose: item.purpose,
      owner: item.owner,
      responsibilities: unique(item.responsibilities),
      dependsOn: unique(edges.filter((edge) => edge.from === item.id).map((edge) => edge.to)),
      usedBy: unique(edges.filter((edge) => edge.to === item.id).map((edge) => edge.from)),
      databaseObjects: unique(item.databaseObjects),
      routes: unique(item.routes),
      apis: unique(item.apis),
      relatedTests: unique(item.relatedTests),
      relatedWorkflows: unique(item.relatedWorkflows),
      criticality: node.criticality,
      protectedComponents: unique(item.protectedComponents),
      publicInterfaces: unique(item.publicInterfaces),
      internalInterfaces: unique(item.internalInterfaces),
      knownUnknowns: unique(item.knownUnknowns),
      repositoryEvidence: node.repositoryEvidence,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const boundaries = safe.map((item) => boundaryFor(item, nodes.find((node) => node.id === item.id)!.criticality));
  const unknowns = safe.flatMap(unknownsFor);
  for (const item of safe) {
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency.subsystemId)) {
        unknowns.push({
          field: "dependency_target",
          subsystemId: item.id,
          reason: `Dependency ${dependency.subsystemId} is not supported by the bounded architecture evidence.`,
        });
      }
    }
  }
  const criticalPaths = nodes
    .filter((node) => node.criticality >= 4)
    .flatMap((node) => analyzeFailurePropagation(graph, node.id))
    .slice(0, MAX_PROPAGATION_PATHS_TOTAL);
  const dependencyPaths = nodes
    .flatMap((node) => traverseArchitectureDependencies(graph, node.id))
    .slice(0, MAX_DEPENDENCY_PATHS_TOTAL);

  return {
    graph,
    subsystemProfiles,
    boundaries,
    dependencyPaths,
    criticalPaths,
    unknowns,
    evidenceType: nodes.length > 0 ? "source_code_proof" : "unknown",
    truncated: evidenceSnapshot.length > MAX_SUBSYSTEMS || edges.length >= MAX_EDGES,
  };
}

const MAX_PROPAGATION_PATHS_TOTAL = 80;
const MAX_DEPENDENCY_PATHS_TOTAL = 120;

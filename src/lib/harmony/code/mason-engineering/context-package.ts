import { calculateEngineeringConfidence } from "./confidence";
import type {
  EngineeringContextPackage,
  EngineeringRiskClassification,
  RepositoryIntelligence,
  RepositoryUnknown,
} from "./types";

function boundedText(value: string | null | undefined, maximum = 2_000): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function boundedUnique(values: readonly string[] | undefined, maximum: number): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maximum);
}

function stableId(input: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function classifyRisk(intelligence: RepositoryIntelligence): EngineeringRiskClassification {
  const terms = intelligence.objectiveTerms;
  if (terms.some((term) => ["delete", "drop", "production", "credential", "secret"].includes(term))) return "high";
  if (intelligence.protectedComponents.length > 0 || intelligence.migrations.length > 0) return "elevated";
  if (intelligence.evidenceRecords.length === 0) return "unknown";
  return "routine";
}

function openQuestionsFor(unknowns: readonly RepositoryUnknown[]): string[] {
  return unknowns.map((unknown) => `What verified evidence resolves ${unknown.field}?`).slice(0, 20);
}

export function createEngineeringContextPackage(input: {
  objective: string;
  constitutionVersion: string;
  intelligence: RepositoryIntelligence;
  rootCauseEvidence?: string | null;
  alternatives?: readonly string[];
  architectureNotes?: readonly string[];
  validationTargets?: readonly string[];
  historicalPatternMatches?: number;
}): EngineeringContextPackage {
  const objective = boundedText(input.objective) ?? "UNKNOWN";
  const rootCauseEvidence = boundedText(input.rootCauseEvidence);
  const alternatives = boundedUnique(input.alternatives, 10);
  const architectureNotes = boundedUnique(input.architectureNotes, 20);
  const validationTargets = boundedUnique(input.validationTargets, 20);
  const historicalPatternMatches = Math.max(0, Math.min(2, Math.floor(input.historicalPatternMatches ?? 0)));
  const unknowns = [...input.intelligence.unknowns];
  if (!rootCauseEvidence) {
    unknowns.push({ field: "root_cause", reason: "No verified root-cause evidence was supplied." });
  }
  const riskClassification = classifyRisk(input.intelligence);
  const evidenceConfidence = calculateEngineeringConfidence({
    intelligence: input.intelligence,
    architectureNoteCount: architectureNotes.length,
    validationTargetCount: validationTargets.length,
    historicalPatternMatches,
    unknownCount: unknowns.length,
    risk: riskClassification,
  });
  const identity = JSON.stringify({
    objective,
    repository: input.intelligence.repository,
    constitutionVersion: input.constitutionVersion,
    evidence: input.intelligence.evidenceRecords.map((record) => record.path),
    unknowns: unknowns.map((unknown) => unknown.field),
  });

  return {
    schemaVersion: "1.0",
    contextId: `mason-context-${stableId(identity)}`,
    objective,
    repository: input.intelligence.repository,
    constitutionVersion: input.constitutionVersion,
    repositoryEvidence: input.intelligence,
    relatedFiles: input.intelligence.relatedFiles,
    relatedComponents: input.intelligence.relatedModules,
    relatedTests: input.intelligence.relatedTests,
    databaseObjects: [...new Set(input.intelligence.evidenceRecords.flatMap((record) => record.databaseObjects ?? []))].sort(),
    workflows: input.intelligence.workflows,
    riskClassification,
    unknowns,
    openQuestions: openQuestionsFor(unknowns),
    architectureNotes,
    rootCauseEvidence,
    alternatives,
    validationTargets,
    historicalPatternMatches,
    evidenceConfidence,
  };
}

export function contextPackageIsComplete(context: EngineeringContextPackage): boolean {
  return context.repositoryEvidence.evidenceRecords.length > 0 &&
    context.relatedFiles.length > 0 &&
    context.relatedTests.length > 0 &&
    context.rootCauseEvidence !== null;
}

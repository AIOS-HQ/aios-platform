import type {
  EngineeringConfidenceScore,
  EngineeringRiskClassification,
  RepositoryIntelligence,
} from "./types";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function calculateEngineeringConfidence(input: {
  intelligence: RepositoryIntelligence;
  architectureNoteCount: number;
  validationTargetCount: number;
  historicalPatternMatches: number;
  unknownCount: number;
  risk: EngineeringRiskClassification;
}): EngineeringConfidenceScore {
  const repositoryGrounding = clamp((input.intelligence.relatedFiles.length / 6) * 30, 0, 30);
  const architectureGrounding = clamp(
    ((input.intelligence.architectureBoundaries.length + input.architectureNoteCount) / 4) * 20,
    0,
    20,
  );
  const relatedTestCoverage = input.intelligence.relatedTests.length > 0 ? 20 : 0;
  const historicalPatternMatch = clamp(input.historicalPatternMatches * 5, 0, 10);
  const validationCoverage = clamp((input.validationTargetCount / 5) * 20, 0, 20);
  const unknownPenalty = clamp(input.unknownCount * 4, 0, 20);
  const riskPenalty = input.risk === "routine" ? 0 : input.risk === "elevated" ? 4 : 10;
  const score = clamp(
    repositoryGrounding + architectureGrounding + relatedTestCoverage +
      historicalPatternMatch + validationCoverage - unknownPenalty - riskPenalty,
    0,
    100,
  );

  return {
    score,
    scale: 100,
    method: "measurable_repository_evidence_v1",
    breakdown: {
      repositoryGrounding,
      architectureGrounding,
      relatedTestCoverage,
      historicalPatternMatch,
      validationCoverage,
      unknownPenalty,
      riskPenalty,
    },
  };
}

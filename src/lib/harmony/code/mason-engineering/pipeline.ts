import { loadMasonEngineeringConstitution } from "./constitution";
import { createEngineeringContextPackage } from "./context-package";
import { createGroundedEngineeringPlan } from "./grounded-planning";
import { getDefaultMasonRepositoryEvidence } from "./repository-manifest";
import { createRepositoryIntelligence } from "./repository-intelligence";
import type { MasonEngineeringFoundationInput, MasonEngineeringFoundationResult } from "./types";

export const MASON_ENGINEERING_PIPELINE_ORDER = Object.freeze([
  "constitution_loaded",
  "repository_intelligence_created",
  "context_package_created",
  "grounded_plan_created",
] as const);

export function createMasonEngineeringFoundation(
  input: MasonEngineeringFoundationInput,
): MasonEngineeringFoundationResult {
  const constitution = loadMasonEngineeringConstitution();
  const evidenceSnapshot = input.evidenceSnapshot ?? getDefaultMasonRepositoryEvidence(input.repository);
  const repositoryIntelligence = createRepositoryIntelligence({
    objective: input.objective,
    repository: input.repository,
    evidenceSnapshot,
    limits: input.limits,
  });
  const contextPackage = createEngineeringContextPackage({
    objective: input.objective,
    constitutionVersion: constitution.version,
    intelligence: repositoryIntelligence,
    rootCauseEvidence: input.rootCauseEvidence,
    alternatives: input.alternatives,
    architectureNotes: input.architectureNotes,
    validationTargets: input.validationTargets,
    historicalPatternMatches: input.historicalPatternMatches,
  });
  const groundedPlan = createGroundedEngineeringPlan(contextPackage);

  return {
    pipelineOrder: MASON_ENGINEERING_PIPELINE_ORDER,
    constitution,
    repositoryIntelligence,
    contextPackage,
    groundedPlan,
  };
}

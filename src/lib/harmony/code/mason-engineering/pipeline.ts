import { createArchitectureContextPackage } from "./architecture-context";
import { createArchitecturalIntelligence } from "./architectural-intelligence";
import { getDefaultMasonArchitectureEvidence } from "./architecture-manifest";
import { loadMasonEngineeringConstitution } from "./constitution";
import { createEngineeringContextPackage } from "./context-package";
import { createGroundedEngineeringPlan } from "./grounded-planning";
import { analyzeArchitectureImpact } from "./impact-analysis";
import {
  createKnowledgeContextPackage,
  identifyKnowledgeOpportunities,
  retrieveEngineeringKnowledge,
} from "./engineering-memory";
import { getDefaultEngineeringKnowledgeCatalog } from "./knowledge-manifest";
import { identifyEngineeringOpportunities } from "./opportunities";
import { getDefaultMasonRepositoryEvidence } from "./repository-manifest";
import { createRepositoryIntelligence } from "./repository-intelligence";
import type { MasonEngineeringFoundationInput, MasonEngineeringFoundationResult } from "./types";

export const MASON_ENGINEERING_PIPELINE_ORDER = Object.freeze([
  "constitution_loaded",
  "repository_intelligence_created",
  "architectural_intelligence_created",
  "engineering_memory_retrieved",
  "engineering_context_package_created",
  "architecture_context_package_created",
  "knowledge_context_package_created",
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
  const architectureEvidence = input.architectureEvidence ?? getDefaultMasonArchitectureEvidence(input.repository);
  const architecturalIntelligence = createArchitecturalIntelligence(architectureEvidence);
  const knowledgeCatalog = input.knowledgeCatalog ?? getDefaultEngineeringKnowledgeCatalog(input.repository);
  const engineeringMemory = retrieveEngineeringKnowledge(input.objective, knowledgeCatalog, architecturalIntelligence);
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
  const impactAnalysis = analyzeArchitectureImpact({
    objective: input.objective,
    repositoryIntelligence,
    architecturalIntelligence,
    architectureEvidence,
  });
  const architectureContextPackage = createArchitectureContextPackage({
    engineeringContextId: contextPackage.contextId,
    intelligence: architecturalIntelligence,
    impactAnalysis,
  });
  const engineeringOpportunities = identifyEngineeringOpportunities(architecturalIntelligence);
  const knowledgeContextPackage = createKnowledgeContextPackage({
    engineeringContextId: contextPackage.contextId,
    retrieval: engineeringMemory,
    catalog: knowledgeCatalog,
    architectureEvidence: architectureContextPackage.repositoryEvidence,
  });
  const knowledgeOpportunities = identifyKnowledgeOpportunities({ architecture: architecturalIntelligence, retrieval: engineeringMemory });
  const groundedPlan = createGroundedEngineeringPlan(contextPackage, architectureContextPackage, knowledgeContextPackage);

  return {
    pipelineOrder: MASON_ENGINEERING_PIPELINE_ORDER,
    constitution,
    repositoryIntelligence,
    architecturalIntelligence,
    contextPackage,
    architectureContextPackage,
    engineeringMemory,
    knowledgeContextPackage,
    engineeringOpportunities: [...engineeringOpportunities, ...knowledgeOpportunities],
    groundedPlan,
  };
}

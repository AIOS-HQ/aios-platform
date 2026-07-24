export type RepositoryEvidenceKind =
  | "source"
  | "test"
  | "route"
  | "api"
  | "migration"
  | "workflow"
  | "environment"
  | "agent"
  | "configuration"
  | "documentation";

export type EngineeringRiskClassification = "routine" | "elevated" | "high" | "unknown";
export type EngineeringApprovalLevel = "founder_review" | "founder_approval_required";

export interface MasonEngineeringPrinciple {
  id: string;
  title: string;
  engineeringBehavior: readonly string[];
}

export interface MasonEngineeringConstitution {
  artifactId: "mason.engineering-constitution";
  version: string;
  mandatory: true;
  principles: readonly MasonEngineeringPrinciple[];
}

export interface RepositoryEvidenceRecord {
  path: string;
  kind: RepositoryEvidenceKind;
  component: string;
  tags: readonly string[];
  dependencies?: readonly string[];
  routes?: readonly string[];
  apis?: readonly string[];
  databaseObjects?: readonly string[];
  workflows?: readonly string[];
  environmentVariables?: readonly string[];
  agentRelationships?: readonly string[];
  architectureBoundaries?: readonly string[];
  protected?: boolean;
}

export interface RepositoryUnknown {
  field: string;
  reason: string;
}

export interface RepositoryIntelligenceLimits {
  maxEvidenceRecords: number;
  maxRelatedFiles: number;
  maxDependencies: number;
  maxValuesPerCategory: number;
}

export interface RepositoryDependencyEdge {
  from: string;
  to: string;
}

export interface RepositoryIntelligence {
  repository: string | null;
  objectiveTerms: string[];
  evidenceRecords: RepositoryEvidenceRecord[];
  affectedFiles: string[];
  relatedFiles: string[];
  relatedModules: string[];
  dependencyGraph: RepositoryDependencyEdge[];
  routes: string[];
  apis: string[];
  relatedTests: string[];
  migrations: string[];
  workflows: string[];
  environmentConfiguration: string[];
  agentRelationships: string[];
  architectureBoundaries: string[];
  protectedComponents: string[];
  unknowns: RepositoryUnknown[];
  truncated: boolean;
  evidenceType: "source_code_proof" | "unknown";
}

export interface EngineeringConfidenceBreakdown {
  repositoryGrounding: number;
  architectureGrounding: number;
  relatedTestCoverage: number;
  historicalPatternMatch: number;
  validationCoverage: number;
  unknownPenalty: number;
  riskPenalty: number;
}

export interface EngineeringConfidenceScore {
  score: number;
  scale: 100;
  method: "measurable_repository_evidence_v1";
  breakdown: EngineeringConfidenceBreakdown;
}

export interface EngineeringContextPackage {
  schemaVersion: "1.0";
  contextId: string;
  objective: string;
  repository: string | null;
  constitutionVersion: string;
  repositoryEvidence: RepositoryIntelligence;
  relatedFiles: string[];
  relatedComponents: string[];
  relatedTests: string[];
  databaseObjects: string[];
  workflows: string[];
  riskClassification: EngineeringRiskClassification;
  unknowns: RepositoryUnknown[];
  openQuestions: string[];
  architectureNotes: string[];
  rootCauseEvidence: string | null;
  alternatives: string[];
  validationTargets: string[];
  historicalPatternMatches: number;
  evidenceConfidence: EngineeringConfidenceScore;
}

export type GroundedPlanStatus = "ready_for_founder_review" | "blocked_context_incomplete";

export interface GroundedEngineeringPlan {
  schemaVersion: "1.0";
  planId: string;
  contextId: string;
  status: GroundedPlanStatus;
  currentState: string;
  desiredState: string;
  repositoryEvidence: string[];
  rootCause: string;
  alternativesConsidered: string[];
  chosenSolution: string;
  filesExpectedToChange: string[];
  validationPlan: string[];
  rollbackStrategy: string;
  approvalLevel: EngineeringApprovalLevel;
  engineeringConfidenceScore: EngineeringConfidenceScore;
}

export interface MasonEngineeringFoundationInput {
  objective: string;
  repository?: string | null;
  evidenceSnapshot?: readonly RepositoryEvidenceRecord[];
  rootCauseEvidence?: string | null;
  alternatives?: readonly string[];
  architectureNotes?: readonly string[];
  validationTargets?: readonly string[];
  historicalPatternMatches?: number;
  limits?: Partial<RepositoryIntelligenceLimits>;
}

export interface MasonEngineeringFoundationResult {
  pipelineOrder: readonly [
    "constitution_loaded",
    "repository_intelligence_created",
    "context_package_created",
    "grounded_plan_created",
  ];
  constitution: MasonEngineeringConstitution;
  repositoryIntelligence: RepositoryIntelligence;
  contextPackage: EngineeringContextPackage;
  groundedPlan: GroundedEngineeringPlan;
}

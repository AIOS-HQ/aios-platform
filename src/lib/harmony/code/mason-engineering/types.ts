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

export type ArchitectureLayer =
  | "experience"
  | "orchestration"
  | "intelligence"
  | "governance"
  | "runtime"
  | "integration"
  | "data"
  | "platform";

export type ArchitectureDependencyType =
  | "import"
  | "runtime"
  | "service"
  | "workflow"
  | "database"
  | "agent";

export type ArchitectureSafetyLevel = "standard" | "protected" | "restricted";
export type ArchitectureCriticalityLevel = 1 | 2 | 3 | 4 | 5;

export interface ArchitectureDependencyEvidence {
  subsystemId: string;
  type: ArchitectureDependencyType;
  evidencePaths: readonly string[];
}

export interface ArchitectureSubsystemEvidence {
  id: string;
  name: string;
  purpose: string;
  owner: string | null;
  responsibilities: readonly string[];
  layer: ArchitectureLayer;
  dependsOn: readonly ArchitectureDependencyEvidence[];
  databaseObjects?: readonly string[];
  routes?: readonly string[];
  apis?: readonly string[];
  relatedTests?: readonly string[];
  relatedWorkflows?: readonly string[];
  protectedComponents?: readonly string[];
  publicInterfaces?: readonly string[];
  internalInterfaces?: readonly string[];
  externalDependencies?: readonly string[];
  runtimeServices?: readonly string[];
  agentKeys?: readonly string[];
  knownUnknowns?: readonly string[];
  evidencePaths: readonly string[];
  criticalitySignals: readonly (
    | "authentication_boundary"
    | "authorization_boundary"
    | "financial_transaction"
    | "production_execution"
    | "persistent_data"
    | "runtime_orchestration"
    | "workflow_dependency"
    | "supporting_service"
    | "presentation_only"
  )[];
}

export interface ArchitectureGraphNode {
  id: string;
  name: string;
  layer: ArchitectureLayer;
  criticality: ArchitectureCriticalityLevel;
  repositoryEvidence: string[];
}

export interface ArchitectureGraphEdge {
  from: string;
  to: string;
  type: ArchitectureDependencyType;
  repositoryEvidence: string[];
}

export interface ArchitectureGraph {
  nodes: ArchitectureGraphNode[];
  edges: ArchitectureGraphEdge[];
}

export interface ArchitectureBoundary {
  subsystemId: string;
  publicInterfaces: string[];
  internalImplementation: string[];
  protectedSurfaces: string[];
  externalDependencies: string[];
  safetyLevel: ArchitectureSafetyLevel;
  repositoryEvidence: string[];
}

export interface ArchitectureSubsystemProfile {
  id: string;
  name: string;
  purpose: string;
  owner: string | null;
  responsibilities: string[];
  dependsOn: string[];
  usedBy: string[];
  databaseObjects: string[];
  routes: string[];
  apis: string[];
  relatedTests: string[];
  relatedWorkflows: string[];
  criticality: ArchitectureCriticalityLevel;
  protectedComponents: string[];
  publicInterfaces: string[];
  internalInterfaces: string[];
  knownUnknowns: string[];
  repositoryEvidence: string[];
}

export interface ArchitectureUnknown {
  field: string;
  subsystemId?: string;
  reason: string;
}

export interface FailurePropagationPath {
  sourceSubsystemId: string;
  downstreamSubsystemIds: string[];
  depth: number;
  repositoryEvidence: string[];
}

export interface ArchitectureDependencyPath {
  sourceSubsystemId: string;
  dependencySubsystemIds: string[];
  depth: number;
  repositoryEvidence: string[];
}

export interface ArchitectureImpactAnalysis {
  affectedFiles: string[];
  affectedSubsystems: string[];
  affectedApis: string[];
  affectedRoutes: string[];
  affectedTests: string[];
  affectedWorkflows: string[];
  affectedAgents: string[];
  affectedDatabaseObjects: string[];
  affectedRuntimeServices: string[];
  unknowns: ArchitectureUnknown[];
  repositoryEvidence: string[];
}

export interface ArchitecturalIntelligence {
  graph: ArchitectureGraph;
  subsystemProfiles: ArchitectureSubsystemProfile[];
  boundaries: ArchitectureBoundary[];
  dependencyPaths: ArchitectureDependencyPath[];
  criticalPaths: FailurePropagationPath[];
  unknowns: ArchitectureUnknown[];
  evidenceType: "source_code_proof" | "unknown";
  truncated: boolean;
}

export interface ArchitectureConfidenceScore {
  score: number;
  scale: 100;
  method: "measurable_architecture_evidence_v1";
  breakdown: {
    verifiedOwnership: number;
    verifiedDependencies: number;
    verifiedBoundaries: number;
    verifiedTests: number;
    verifiedWorkflows: number;
    verifiedRoutes: number;
    verifiedRuntimeConnections: number;
    unknownPenalty: number;
  };
}

export type EngineeringOpportunityCategory =
  | "technical_debt"
  | "duplicate_implementation"
  | "dead_code"
  | "circular_dependency"
  | "high_coupling"
  | "missing_tests"
  | "missing_documentation"
  | "performance"
  | "security_hardening"
  | "reliability"
  | "developer_experience"
  | "ai_runtime"
  | "mason_capability";

export interface EngineeringOpportunity {
  category: EngineeringOpportunityCategory;
  affectedSubsystem: string;
  repositoryEvidence: string[];
  estimatedImpact: "low" | "medium" | "high";
  estimatedComplexity: "low" | "medium" | "high";
  confidence: number;
  recommendation: string;
}

export interface ArchitectureContextPackage {
  schemaVersion: "1.0";
  contextId: string;
  architecturalGraph: ArchitectureGraph;
  subsystemProfiles: ArchitectureSubsystemProfile[];
  dependencyGraph: ArchitectureGraphEdge[];
  dependencyPaths: ArchitectureDependencyPath[];
  ownership: { subsystemId: string; owner: string | null }[];
  criticalPaths: FailurePropagationPath[];
  protectedBoundaries: ArchitectureBoundary[];
  failurePropagation: FailurePropagationPath[];
  criticality: { subsystemId: string; level: ArchitectureCriticalityLevel }[];
  architectureUnknowns: ArchitectureUnknown[];
  repositoryEvidence: string[];
  impactAnalysis: ArchitectureImpactAnalysis;
  architectureConfidence: ArchitectureConfidenceScore;
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
  architectureContextId: string;
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
  architectureEvidence?: readonly ArchitectureSubsystemEvidence[];
}

export interface MasonEngineeringFoundationResult {
  pipelineOrder: readonly [
    "constitution_loaded",
    "repository_intelligence_created",
    "architectural_intelligence_created",
    "engineering_context_package_created",
    "architecture_context_package_created",
    "grounded_plan_created",
  ];
  constitution: MasonEngineeringConstitution;
  repositoryIntelligence: RepositoryIntelligence;
  architecturalIntelligence: ArchitecturalIntelligence;
  contextPackage: EngineeringContextPackage;
  architectureContextPackage: ArchitectureContextPackage;
  engineeringOpportunities: EngineeringOpportunity[];
  groundedPlan: GroundedEngineeringPlan;
}

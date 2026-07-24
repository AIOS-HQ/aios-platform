export type EngineeringMemoryCategory =
  | "architecture_decision"
  | "repository_pattern"
  | "successful_implementation"
  | "failed_implementation"
  | "validation_lesson"
  | "ci_lesson"
  | "migration_lesson"
  | "deployment_lesson"
  | "founder_engineering_decision"
  | "approved_engineering_standard"
  | "security_lesson"
  | "performance_lesson"
  | "runtime_lesson"
  | "testing_pattern";

export type KnowledgeVerificationStatus = "verified" | "deprecated" | "superseded" | "historical" | "unknown";
export type KnowledgeRecordStatus = "active" | "archived";

export interface EngineeringMemory {
  id: string;
  version: string;
  category: EngineeringMemoryCategory;
  title: string;
  summary: string;
  repositoryEvidence: readonly string[];
  relatedFiles: readonly string[];
  relatedSubsystems: readonly string[];
  relatedTests: readonly string[];
  relatedPrs: readonly number[];
  relatedIssues: readonly number[];
  origin: "repository" | "pull_request" | "founder_decision" | "validation";
  verificationStatus: KnowledgeVerificationStatus;
  confidence: number;
  owner: string;
  createdAt: string;
  lastVerifiedAt: string;
  status: KnowledgeRecordStatus;
}

export interface EngineeringPattern {
  id: string;
  name: string;
  version: string;
  purpose: string;
  evidence: readonly string[];
  files: readonly string[];
  usedBy: readonly string[];
  confidence: number;
  lastVerifiedAt: string;
  knownLimitations: readonly string[];
  verificationStatus: KnowledgeVerificationStatus;
}

export interface EngineeringAdr {
  id: string;
  version: string;
  decision: string;
  problem: string;
  alternativesConsidered: readonly string[];
  chosenSolution: string;
  tradeoffs: readonly string[];
  evidence: readonly string[];
  validation: readonly string[];
  affectedSubsystems: readonly string[];
  owner: string;
  status: "proposed" | "accepted" | "deprecated" | "superseded";
  timestamp: string;
}

export interface EngineeringStandard {
  id: string;
  version: string;
  title: string;
  rule: string;
  evidence: readonly string[];
  owner: string;
  lastVerifiedAt: string;
}

export interface EngineeringKnowledgeCatalog {
  catalogId: "mason.engineering-knowledge";
  version: string;
  asOf: string;
  memories: readonly EngineeringMemory[];
  patterns: readonly EngineeringPattern[];
  adrs: readonly EngineeringAdr[];
  standards: readonly EngineeringStandard[];
}

export interface KnowledgeUnknown {
  field: string;
  reason: string;
}

export interface EngineeringMemoryRetrieval {
  memories: EngineeringMemory[];
  patterns: EngineeringPattern[];
  adrs: EngineeringAdr[];
  standards: EngineeringStandard[];
  repositoryEvidence: string[];
  unknowns: KnowledgeUnknown[];
}

export type KnowledgeGraphNodeType = "subsystem" | "pattern" | "adr" | "memory" | "evidence" | "validation";

export interface KnowledgeGraphNode {
  id: string;
  type: KnowledgeGraphNodeType;
  label: string;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  relationship: "applies_to" | "supports" | "records" | "validates" | "depends_on";
  evidence: string[];
}

export interface EngineeringKnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface KnowledgeConfidenceScore {
  score: number;
  scale: 100;
  method: "measurable_engineering_knowledge_v1";
  breakdown: {
    verification: number;
    freshness: number;
    evidenceCoverage: number;
    patternReuse: number;
    repositoryConsistency: number;
    unknownPenalty: number;
  };
}

export interface KnowledgeContextPackage {
  schemaVersion: "1.0";
  contextId: string;
  relevantAdrs: EngineeringAdr[];
  relevantPatterns: EngineeringPattern[];
  relevantLessons: EngineeringMemory[];
  relevantMemories: EngineeringMemory[];
  confidence: KnowledgeConfidenceScore;
  unknowns: KnowledgeUnknown[];
  evidence: string[];
  engineeringStandards: EngineeringStandard[];
  repositoryReferences: string[];
  knowledgeGraph: EngineeringKnowledgeGraph;
}

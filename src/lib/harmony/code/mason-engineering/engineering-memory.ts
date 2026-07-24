import type { ArchitecturalIntelligence, EngineeringOpportunity } from "./types";
import type {
  EngineeringAdr, EngineeringKnowledgeCatalog, EngineeringKnowledgeGraph, EngineeringMemory,
  EngineeringMemoryRetrieval, EngineeringPattern, KnowledgeConfidenceScore, KnowledgeContextPackage,
  KnowledgeUnknown,
} from "./knowledge-types";

const MAX_RESULTS = 12;
const LESSON_CATEGORIES = new Set(["validation_lesson", "ci_lesson", "migration_lesson", "deployment_lesson", "security_lesson", "performance_lesson", "runtime_lesson", "testing_pattern"]);

function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function validateEngineeringMemory(memory: EngineeringMemory): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!/^memory\.[a-z0-9-]+$/.test(memory.id)) reasons.push("invalid_id");
  if (!/^\d+\.\d+\.\d+$/.test(memory.version)) reasons.push("invalid_version");
  if (!memory.title.trim() || !memory.summary.trim()) reasons.push("missing_documentation");
  if (memory.repositoryEvidence.length === 0 || !memory.repositoryEvidence.every(safePath)) reasons.push("missing_repository_evidence");
  if (memory.relatedFiles.length === 0 || !memory.relatedFiles.every(safePath)) reasons.push("missing_related_files");
  if (memory.confidence < 0 || memory.confidence > 1) reasons.push("invalid_confidence");
  if (!Number.isFinite(Date.parse(memory.createdAt)) || !Number.isFinite(Date.parse(memory.lastVerifiedAt))) reasons.push("invalid_timestamp");
  return { valid: reasons.length === 0, reasons };
}

export function createEngineeringMemory(memory: EngineeringMemory): EngineeringMemory {
  const validation = validateEngineeringMemory(memory);
  if (!validation.valid) throw new Error(`engineering_memory_rejected:${validation.reasons.join(",")}`);
  return Object.freeze({ ...memory });
}

export function validateEngineeringPattern(pattern: EngineeringPattern): boolean {
  return /^pattern\.[a-z0-9-]+$/.test(pattern.id) && /^\d+\.\d+\.\d+$/.test(pattern.version) &&
    pattern.evidence.length > 0 && pattern.evidence.every(safePath) && pattern.files.every(safePath) &&
    pattern.confidence >= 0 && pattern.confidence <= 1;
}

export function createEngineeringAdr(adr: EngineeringAdr): EngineeringAdr {
  if (!/^adr\.[a-z0-9-]+$/.test(adr.id) || !/^\d+\.\d+\.\d+$/.test(adr.version) ||
    adr.evidence.length === 0 || !adr.evidence.every(safePath) || !adr.decision.trim() || !adr.chosenSolution.trim()) {
    throw new Error("engineering_adr_rejected");
  }
  return Object.freeze({ ...adr });
}

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ?? [])].filter((term) => term.length > 2).slice(0, 80);
}

function score(text: string, objectiveTerms: readonly string[]): number {
  const normalized = text.toLowerCase();
  return objectiveTerms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0);
}

export function retrieveEngineeringKnowledge(
  objective: string,
  catalog: EngineeringKnowledgeCatalog,
  architecture: ArchitecturalIntelligence,
): EngineeringMemoryRetrieval {
  const objectiveTerms = terms(objective);
  const subsystemNames = architecture.subsystemProfiles.map((profile) => `${profile.id} ${profile.name}`).join(" ");
  const relevant = <T>(items: readonly T[], searchable: (item: T) => string) => items
    .map((item) => ({ item, score: score(`${searchable(item)} ${subsystemNames}`, objectiveTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.item);
  const memories = relevant(catalog.memories.filter((memory) => validateEngineeringMemory(memory).valid && memory.verificationStatus !== "unknown"),
    (memory) => `${memory.category} ${memory.title} ${memory.summary} ${memory.relatedSubsystems.join(" ")} ${memory.relatedFiles.join(" ")}`);
  const patterns = relevant(catalog.patterns.filter(validateEngineeringPattern),
    (pattern) => `${pattern.name} ${pattern.purpose} ${pattern.usedBy.join(" ")} ${pattern.files.join(" ")}`);
  const adrs = relevant(catalog.adrs, (adr) => `${adr.decision} ${adr.problem} ${adr.affectedSubsystems.join(" ")}`);
  const standards = relevant(catalog.standards, (standard) => `${standard.title} ${standard.rule}`);
  const repositoryEvidence = unique([
    ...memories.flatMap((memory) => memory.repositoryEvidence),
    ...patterns.flatMap((pattern) => pattern.evidence),
    ...adrs.flatMap((adr) => adr.evidence),
    ...standards.flatMap((standard) => standard.evidence),
  ]);
  const unknowns: KnowledgeUnknown[] = repositoryEvidence.length === 0
    ? [{ field: "engineering_knowledge", reason: "No verified engineering knowledge matched the objective." }]
    : [];
  return { memories, patterns, adrs, standards, repositoryEvidence, unknowns };
}

export function createEngineeringKnowledgeGraph(
  retrieval: EngineeringMemoryRetrieval,
): EngineeringKnowledgeGraph {
  const nodes = new Map<string, { id: string; type: "subsystem" | "pattern" | "adr" | "memory" | "evidence" | "validation"; label: string }>();
  const edges: EngineeringKnowledgeGraph["edges"] = [];
  const addEvidence = (ownerId: string, paths: readonly string[]) => paths.forEach((path) => {
    const id = `evidence:${path}`;
    nodes.set(id, { id, type: "evidence", label: path });
    edges.push({ from: id, to: ownerId, relationship: "supports", evidence: [path] });
  });
  retrieval.memories.forEach((memory) => {
    nodes.set(memory.id, { id: memory.id, type: "memory", label: memory.title });
    memory.relatedSubsystems.forEach((subsystem) => {
      const id = `subsystem:${subsystem}`;
      nodes.set(id, { id, type: "subsystem", label: subsystem });
      edges.push({ from: memory.id, to: id, relationship: "records", evidence: [...memory.repositoryEvidence] });
    });
    addEvidence(memory.id, memory.repositoryEvidence);
  });
  retrieval.patterns.forEach((pattern) => {
    nodes.set(pattern.id, { id: pattern.id, type: "pattern", label: pattern.name });
    pattern.usedBy.forEach((subsystem) => {
      const id = `subsystem:${subsystem}`;
      nodes.set(id, { id, type: "subsystem", label: subsystem });
      edges.push({ from: pattern.id, to: id, relationship: "applies_to", evidence: [...pattern.evidence] });
    });
    addEvidence(pattern.id, pattern.evidence);
  });
  retrieval.adrs.forEach((adr) => {
    nodes.set(adr.id, { id: adr.id, type: "adr", label: adr.decision });
    adr.affectedSubsystems.forEach((subsystem) => {
      const id = `subsystem:${subsystem}`;
      nodes.set(id, { id, type: "subsystem", label: subsystem });
      edges.push({ from: adr.id, to: id, relationship: "applies_to", evidence: [...adr.evidence] });
    });
    addEvidence(adr.id, adr.evidence);
  });
  return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: edges.slice(0, 160) };
}

export function calculateKnowledgeConfidence(
  retrieval: EngineeringMemoryRetrieval,
  catalog: EngineeringKnowledgeCatalog,
  architectureEvidence: readonly string[],
): KnowledgeConfidenceScore {
  const records = [...retrieval.memories, ...retrieval.patterns];
  const verification = records.length === 0 ? 0 : Math.round(records.filter((record) => record.verificationStatus === "verified").length / records.length * 25);
  const fresh = records.filter((record) => record.lastVerifiedAt <= catalog.asOf).length;
  const freshness = records.length === 0 ? 0 : Math.round(fresh / records.length * 15);
  const evidenceCoverage = Math.min(20, retrieval.repositoryEvidence.length * 3);
  const patternReuse = Math.min(15, retrieval.patterns.reduce((total, pattern) => total + pattern.usedBy.length, 0) * 2);
  const architectureSet = new Set(architectureEvidence);
  const consistent = retrieval.repositoryEvidence.filter((path) => architectureSet.has(path)).length;
  const repositoryConsistency = retrieval.repositoryEvidence.length === 0 ? 0 : Math.round(consistent / retrieval.repositoryEvidence.length * 25);
  const unknownPenalty = Math.min(20, retrieval.unknowns.length * 5);
  return {
    score: Math.max(0, Math.min(100, verification + freshness + evidenceCoverage + patternReuse + repositoryConsistency - unknownPenalty)),
    scale: 100,
    method: "measurable_engineering_knowledge_v1",
    breakdown: { verification, freshness, evidenceCoverage, patternReuse, repositoryConsistency, unknownPenalty },
  };
}

function stableId(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createKnowledgeContextPackage(input: {
  engineeringContextId: string;
  retrieval: EngineeringMemoryRetrieval;
  catalog: EngineeringKnowledgeCatalog;
  architectureEvidence: readonly string[];
}): KnowledgeContextPackage {
  const lessons = input.retrieval.memories.filter((memory) => LESSON_CATEGORIES.has(memory.category));
  const confidence = calculateKnowledgeConfidence(input.retrieval, input.catalog, input.architectureEvidence);
  const graph = createEngineeringKnowledgeGraph(input.retrieval);
  return {
    schemaVersion: "1.0",
    contextId: `mason-knowledge-${stableId(JSON.stringify({ engineeringContextId: input.engineeringContextId, memories: input.retrieval.memories.map((m) => m.id), patterns: input.retrieval.patterns.map((p) => p.id), adrs: input.retrieval.adrs.map((a) => a.id) }))}`,
    relevantAdrs: input.retrieval.adrs,
    relevantPatterns: input.retrieval.patterns,
    relevantLessons: lessons,
    relevantMemories: input.retrieval.memories,
    confidence,
    unknowns: input.retrieval.unknowns,
    evidence: input.retrieval.repositoryEvidence,
    engineeringStandards: input.retrieval.standards,
    repositoryReferences: unique(input.retrieval.repositoryEvidence),
    knowledgeGraph: graph,
  };
}

export function identifyKnowledgeOpportunities(input: {
  architecture: ArchitecturalIntelligence;
  retrieval: EngineeringMemoryRetrieval;
}): EngineeringOpportunity[] {
  const patternSubsystems = new Set(input.retrieval.patterns.flatMap((pattern) => pattern.usedBy));
  const adrSubsystems = new Set(input.retrieval.adrs.flatMap((adr) => adr.affectedSubsystems));
  return input.architecture.subsystemProfiles.flatMap((profile): EngineeringOpportunity[] => {
    const result: EngineeringOpportunity[] = [];
    if (profile.criticality >= 4 && !adrSubsystems.has(profile.id)) result.push({
      category: "missing_adr_coverage", affectedSubsystem: profile.id, repositoryEvidence: profile.repositoryEvidence,
      estimatedImpact: "high", estimatedComplexity: "medium", confidence: 0.85,
      recommendation: "Review whether this critical subsystem needs an explicit, reviewed ADR.",
    });
    if (profile.dependsOn.length + profile.usedBy.length >= 4 && !patternSubsystems.has(profile.id)) result.push({
      category: "missing_reusable_pattern", affectedSubsystem: profile.id, repositoryEvidence: profile.repositoryEvidence,
      estimatedImpact: "medium", estimatedComplexity: "medium", confidence: 0.8,
      recommendation: "Document a reusable engineering pattern before expanding this coupled subsystem.",
    });
    if (profile.relatedTests.length === 0) result.push({
      category: "validation_gap", affectedSubsystem: profile.id, repositoryEvidence: profile.repositoryEvidence,
      estimatedImpact: "medium", estimatedComplexity: "low", confidence: 0.9,
      recommendation: "Add or register focused tests before changing this subsystem.",
    });
    return result;
  });
}

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createArchitecturalIntelligence,
  createEngineeringAdr,
  createEngineeringKnowledgeGraph,
  createEngineeringMemory,
  createKnowledgeContextPackage,
  createMasonEngineeringFoundation,
  getDefaultEngineeringKnowledgeCatalog,
  getDefaultMasonArchitectureEvidence,
  identifyKnowledgeOpportunities,
  retrieveEngineeringKnowledge,
  validateEngineeringMemory,
  validateEngineeringPattern,
  type EngineeringMemory,
} from "@/lib/harmony/code/mason-engineering";
import { MASON_SAFE_EXECUTION_BOUNDARY, createMasonNativeRuntimePlan } from "@/lib/harmony/code/mason";

const repository = "AIOS-HQ/aios-platform";
const catalog = getDefaultEngineeringKnowledgeCatalog(repository);

describe("Mason V2 Engineering Memory", () => {
  it("accepts only versioned, repository-backed engineering memories", () => {
    const memory = catalog.memories[0];
    expect(validateEngineeringMemory(memory)).toEqual({ valid: true, reasons: [] });
    expect(createEngineeringMemory(memory)).toEqual(memory);
    const invalid = { ...memory, repositoryEvidence: [], relatedFiles: [] } as EngineeringMemory;
    expect(validateEngineeringMemory(invalid)).toMatchObject({ valid: false });
    expect(() => createEngineeringMemory(invalid)).toThrow("engineering_memory_rejected");
  });

  it("provides a versioned pattern library and reviewed ADR runtime", () => {
    expect(catalog.patterns.every(validateEngineeringPattern)).toBe(true);
    expect(catalog.patterns.map((pattern) => pattern.name)).toEqual(expect.arrayContaining([
      "Approval Pattern", "Event Mesh Pattern", "Supabase Pattern", "Connector Pattern", "Validation Pattern",
    ]));
    expect(createEngineeringAdr(catalog.adrs[0])).toEqual(catalog.adrs[0]);
    expect(() => createEngineeringAdr({ ...catalog.adrs[0], evidence: [] })).toThrow("engineering_adr_rejected");
  });

  it("retrieves only objective-relevant verified engineering knowledge", () => {
    const architecture = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const retrieval = retrieveEngineeringKnowledge("Change Mason approval validation", catalog, architecture);
    expect(retrieval.memories.length).toBeGreaterThan(0);
    expect(retrieval.patterns.map((pattern) => pattern.id)).toContain("pattern.approval-boundary");
    expect(retrieval.adrs.map((adr) => adr.id)).toContain("adr.founder-governed-merge");
    expect(retrieval.repositoryEvidence.length).toBeGreaterThan(0);
  });

  it("returns UNKNOWN rather than unrelated memory", () => {
    const architecture = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const retrieval = retrieveEngineeringKnowledge("unproven satellite quantum orchard", catalog, architecture);
    expect(retrieval.memories).toEqual([]);
    expect(retrieval.patterns).toEqual([]);
    expect(retrieval.unknowns).toContainEqual(expect.objectContaining({ field: "engineering_knowledge" }));
  });

  it("connects memories, patterns, ADRs, evidence, and subsystems in the knowledge graph", () => {
    const architecture = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const retrieval = retrieveEngineeringKnowledge("Mason approval validation", catalog, architecture);
    const graph = createEngineeringKnowledgeGraph(retrieval);
    expect(graph.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(["memory", "pattern", "adr", "evidence", "subsystem"]));
    expect(graph.edges.every((edge) => edge.evidence.length > 0)).toBe(true);
  });

  it("creates a separate Knowledge Context with independent measurable confidence", () => {
    const architecture = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const retrieval = retrieveEngineeringKnowledge("Mason approval validation", catalog, architecture);
    const context = createKnowledgeContextPackage({
      engineeringContextId: "mason-context-test",
      retrieval,
      catalog,
      architectureEvidence: architecture.graph.nodes.flatMap((node) => node.repositoryEvidence),
    });
    expect(context.contextId).toMatch(/^mason-knowledge-/);
    expect(context.confidence.method).toBe("measurable_engineering_knowledge_v1");
    expect(context.confidence.score).toBeGreaterThan(0);
    expect(context.engineeringStandards.length).toBeGreaterThan(0);
  });

  it("detects only evidence-backed knowledge opportunities", () => {
    const architecture = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const retrieval = retrieveEngineeringKnowledge("Mason approval validation", catalog, architecture);
    const opportunities = identifyKnowledgeOpportunities({ architecture, retrieval });
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities.every((opportunity) => opportunity.repositoryEvidence.length > 0)).toBe(true);
  });

  it("makes memory and Knowledge Context mandatory before planning without changing execution", async () => {
    const foundation = createMasonEngineeringFoundation({
      objective: "Improve Mason approval validation",
      repository,
      rootCauseEvidence: "Verified validation lessons were not retrieved before planning.",
    });
    expect(foundation.pipelineOrder).toEqual([
      "constitution_loaded", "repository_intelligence_created", "architectural_intelligence_created",
      "engineering_memory_retrieved", "engineering_context_package_created", "architecture_context_package_created",
      "knowledge_context_package_created", "grounded_plan_created",
    ]);
    expect(foundation.groundedPlan.knowledgeContextId).toBe(foundation.knowledgeContextPackage.contextId);
    const runtime = createMasonNativeRuntimePlan({ objective: "Inspect memory", repository });
    expect(MASON_SAFE_EXECUTION_BOUNDARY).toMatchObject({
      founderApprovalRequiredForMerge: true,
      directProductionEditingAllowed: false,
      mergeWithoutFounderApprovalAllowed: false,
      destructiveOperationsAllowed: false,
    });
    expect(runtime.approvalGatedSteps.map((step) => step.id)).toEqual(expect.arrayContaining(["patch_generation", "pull_request"]));
    const source = await readFile("src/lib/harmony/code/mason-engineering/engineering-memory.ts", "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|readFile|readdir|glob\(|child_process|process\.env/);
  });
});

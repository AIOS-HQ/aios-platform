import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MASON_ENGINEERING_PIPELINE_ORDER,
  analyzeArchitectureImpact,
  analyzeFailurePropagation,
  calculateArchitectureConfidence,
  classifySubsystemCriticality,
  createArchitectureContextPackage,
  createArchitecturalIntelligence,
  createMasonEngineeringFoundation,
  createRepositoryIntelligence,
  getDefaultMasonArchitectureEvidence,
  identifyEngineeringOpportunities,
  traverseArchitectureDependencies,
  type ArchitectureSubsystemEvidence,
} from "@/lib/harmony/code/mason-engineering";
import { MASON_SAFE_EXECUTION_BOUNDARY, createMasonNativeRuntimePlan } from "@/lib/harmony/code/mason";

const repository = "AIOS-HQ/aios-platform";

describe("Mason V2 Architectural Intelligence", () => {
  it("creates the bounded AIOS Architecture Graph from repository-backed subsystem evidence", () => {
    const intelligence = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    expect(intelligence.evidenceType).toBe("source_code_proof");
    expect(intelligence.graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      "harmony",
      "mason",
      "julius",
      "atlas",
      "catalyst",
      "ledger",
      "founder-os",
      "marketplace",
      "event-mesh",
      "approval-engine",
      "execution-ledger",
      "supabase",
      "authentication",
      "billing",
      "connector-runtime",
      "ai-workforce",
    ]));
    expect(intelligence.graph.nodes).toHaveLength(16);
    expect(intelligence.graph.edges.every((edge) => edge.repositoryEvidence.length > 0)).toBe(true);
  });

  it("anchors every subsystem and dependency relationship to an existing repository path", async () => {
    const evidence = getDefaultMasonArchitectureEvidence(repository);
    const paths = [...new Set(evidence.flatMap((subsystem) => [
      ...subsystem.evidencePaths,
      ...subsystem.dependsOn.flatMap((dependency) => dependency.evidencePaths),
      ...(subsystem.relatedTests ?? []),
    ]))];
    await expect(Promise.all(paths.map((path) => access(path)))).resolves.toHaveLength(paths.length);
  });

  it("builds deterministic dependency direction, consumers, and bounded propagation", () => {
    const intelligence = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    expect(intelligence.graph.edges).toContainEqual(expect.objectContaining({
      from: "approval-engine",
      to: "authentication",
      type: "service",
    }));
    const authentication = intelligence.subsystemProfiles.find((profile) => profile.id === "authentication")!;
    expect(authentication.usedBy).toEqual(expect.arrayContaining(["approval-engine", "billing", "founder-os"]));
    const propagation = analyzeFailurePropagation(intelligence.graph, "supabase");
    expect(propagation.length).toBeGreaterThan(0);
    expect(propagation.every((path) => path.depth === path.downstreamSubsystemIds.length && path.depth <= 4)).toBe(true);
    expect(propagation.some((path) => path.downstreamSubsystemIds.includes("authentication"))).toBe(true);
    const dependencies = traverseArchitectureDependencies(intelligence.graph, "mason");
    expect(dependencies.some((path) => path.dependencySubsystemIds.includes("supabase"))).toBe(true);
    expect(dependencies.every((path) => path.depth <= 4)).toBe(true);
  });

  it("creates complete subsystem profiles without inventing absent interfaces", () => {
    const intelligence = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const mason = intelligence.subsystemProfiles.find((profile) => profile.id === "mason")!;
    expect(mason).toMatchObject({
      owner: "Mason",
      criticality: 5,
    });
    expect(mason.dependsOn).toEqual(expect.arrayContaining(["julius", "approval-engine", "execution-ledger"]));
    expect(mason.databaseObjects).toContain("mason_execution_ledger");
    expect(mason.repositoryEvidence).toContain("src/lib/harmony/code/mason.ts");
    expect(mason.publicInterfaces).toEqual([]);
  });

  it("derives criticality and architectural boundaries from explicit evidence signals", () => {
    const evidence = getDefaultMasonArchitectureEvidence(repository);
    const billing = evidence.find((subsystem) => subsystem.id === "billing")!;
    const marketplace = evidence.find((subsystem) => subsystem.id === "marketplace")!;
    expect(classifySubsystemCriticality(billing)).toBe(5);
    expect(classifySubsystemCriticality(marketplace)).toBe(4);
    const intelligence = createArchitecturalIntelligence(evidence);
    expect(intelligence.boundaries.find((boundary) => boundary.subsystemId === "authentication")).toMatchObject({
      safetyLevel: "restricted",
    });
    expect(intelligence.boundaries.find((boundary) => boundary.subsystemId === "atlas")).toMatchObject({
      safetyLevel: "standard",
    });
  });

  it("produces evidence-backed impact analysis and leaves unsupported impact unknown", () => {
    const architectureEvidence = getDefaultMasonArchitectureEvidence(repository);
    const architecturalIntelligence = createArchitecturalIntelligence(architectureEvidence);
    const repositoryIntelligence = createRepositoryIntelligence({
      objective: "Change Event Mesh worker dispatch",
      repository,
      evidenceSnapshot: [{
        path: "src/lib/event-mesh/index.ts",
        kind: "source",
        component: "Event Mesh",
        tags: ["event", "mesh", "worker", "dispatch"],
      }],
    });
    const impact = analyzeArchitectureImpact({
      objective: "Change Event Mesh worker dispatch",
      repositoryIntelligence,
      architecturalIntelligence,
      architectureEvidence,
    });
    expect(impact.affectedSubsystems).toContain("event-mesh");
    expect(impact.affectedDatabaseObjects).toContain("event_mesh_events");
    expect(impact.affectedRuntimeServices).toContain("Event Mesh worker");
    expect(impact.repositoryEvidence).toContain("src/lib/event-mesh/index.ts");

    const unknown = analyzeArchitectureImpact({
      objective: "Change an unproven satellite",
      repositoryIntelligence: createRepositoryIntelligence({ objective: "unproven satellite", evidenceSnapshot: [] }),
      architecturalIntelligence,
      architectureEvidence,
    });
    expect(unknown.affectedSubsystems).toEqual([]);
    expect(unknown.unknowns).toContainEqual(expect.objectContaining({ field: "affected_subsystems" }));
  });

  it("creates a separate Architecture Context Package and independent confidence score", () => {
    const architectureEvidence = getDefaultMasonArchitectureEvidence(repository);
    const architecturalIntelligence = createArchitecturalIntelligence(architectureEvidence);
    const repositoryIntelligence = createRepositoryIntelligence({
      objective: "Repair approval runtime",
      repository,
      evidenceSnapshot: [{
        path: "src/lib/harmony/os/approval-actions.ts",
        kind: "source",
        component: "Approval Engine",
        tags: ["approval", "runtime"],
      }],
    });
    const impactAnalysis = analyzeArchitectureImpact({
      objective: "Repair approval runtime",
      repositoryIntelligence,
      architecturalIntelligence,
      architectureEvidence,
    });
    const context = createArchitectureContextPackage({
      engineeringContextId: "mason-context-test",
      intelligence: architecturalIntelligence,
      impactAnalysis,
    });
    expect(context.contextId).toMatch(/^mason-architecture-/);
    expect(context.architectureConfidence.method).toBe("measurable_architecture_evidence_v1");
    expect(context.architectureConfidence.score).toBeGreaterThan(0);
    expect(context.protectedBoundaries.length).toBeGreaterThan(0);
    expect(context.impactAnalysis.affectedSubsystems).toContain("approval-engine");
    expect(calculateArchitectureConfidence(architecturalIntelligence)).toEqual(context.architectureConfidence);
  });

  it("detects only evidence-backed engineering opportunities", () => {
    const intelligence = createArchitecturalIntelligence(getDefaultMasonArchitectureEvidence(repository));
    const opportunities = identifyEngineeringOpportunities(intelligence);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities.every((opportunity) => opportunity.repositoryEvidence.length > 0)).toBe(true);
    expect(opportunities).toContainEqual(expect.objectContaining({
      category: "high_coupling",
      affectedSubsystem: "supabase",
    }));
    expect(opportunities.some((opportunity) => opportunity.category === "dead_code")).toBe(false);
  });

  it("classifies unverified ownership and dependency targets as UNKNOWN", () => {
    const evidence: ArchitectureSubsystemEvidence[] = [{
      id: "bounded-test",
      name: "Bounded Test",
      purpose: "Test unknown handling.",
      owner: null,
      responsibilities: ["test"],
      layer: "runtime",
      dependsOn: [{ subsystemId: "not-proven", type: "service", evidencePaths: ["src/test.ts"] }],
      evidencePaths: ["src/test.ts"],
      criticalitySignals: ["supporting_service"],
    }];
    const intelligence = createArchitecturalIntelligence(evidence);
    expect(intelligence.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "owner" }),
      expect.objectContaining({ field: "dependency_target" }),
    ]));
    expect(intelligence.graph.edges).toEqual([]);
  });

  it("extends the mandatory pipeline while preserving Mason execution governance", async () => {
    const foundation = createMasonEngineeringFoundation({
      objective: "Improve Mason architecture planning",
      repository,
      rootCauseEvidence: "Architecture relationships were not represented in the engineering context.",
      validationTargets: ["npm test"],
    });
    expect(foundation.pipelineOrder).toEqual([
      "constitution_loaded",
      "repository_intelligence_created",
      "architectural_intelligence_created",
      "engineering_memory_retrieved",
      "engineering_context_package_created",
      "architecture_context_package_created",
      "knowledge_context_package_created",
      "grounded_plan_created",
    ]);
    expect(foundation.pipelineOrder).toEqual(MASON_ENGINEERING_PIPELINE_ORDER);
    expect(foundation.groundedPlan.architectureContextId).toBe(foundation.architectureContextPackage.contextId);
    expect(foundation.groundedPlan.knowledgeContextId).toBe(foundation.knowledgeContextPackage.contextId);
    expect(foundation.engineeringOpportunities.length).toBeGreaterThan(0);

    const runtime = createMasonNativeRuntimePlan({ objective: "Inspect architecture", repository });
    expect(MASON_SAFE_EXECUTION_BOUNDARY).toMatchObject({
      founderApprovalRequiredForMerge: true,
      directProductionEditingAllowed: false,
      mergeWithoutFounderApprovalAllowed: false,
      destructiveOperationsAllowed: false,
    });
    expect(runtime.approvalGatedSteps.map((step) => step.id)).toEqual(expect.arrayContaining(["patch_generation", "pull_request"]));

    const source = await readFile("src/lib/harmony/code/mason-engineering/architectural-intelligence.ts", "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|readFile|readdir|glob\(|child_process|process\.env/);
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MASON_ENGINEERING_PIPELINE_ORDER,
  calculateEngineeringConfidence,
  createEngineeringContextPackage,
  createMasonEngineeringFoundation,
  createRepositoryIntelligence,
  loadMasonEngineeringConstitution,
  requireGroundedPlanReady,
  type RepositoryEvidenceRecord,
} from "@/lib/harmony/code/mason-engineering";
import {
  MASON_SAFE_EXECUTION_BOUNDARY,
  createMasonExecutionPlan,
  createMasonNativeRuntimePlan,
} from "@/lib/harmony/code/mason";

const groundedEvidence: RepositoryEvidenceRecord[] = [
  {
    path: "src/lib/harmony/code/mason.ts",
    kind: "source",
    component: "Mason planning",
    tags: ["mason", "planning", "database", "workflow"],
    dependencies: ["src/lib/workforce/mason-action.ts"],
    databaseObjects: ["mason_execution_ledger"],
    workflows: ["Launch Validation"],
    agentRelationships: ["Harmony routes engineering work to Mason"],
    architectureBoundaries: ["Founder approval remains mandatory"],
    protected: true,
  },
  {
    path: "tests/unit/mason.test.ts",
    kind: "test",
    component: "Mason regression tests",
    tags: ["mason", "planning", "test"],
    dependencies: ["src/lib/harmony/code/mason.ts"],
  },
  {
    path: "supabase/migrations/20260717000000_mason_execution_ledger.sql",
    kind: "migration",
    component: "Mason ledger migration",
    tags: ["mason", "database", "migration"],
    databaseObjects: ["mason_execution_ledger"],
    protected: true,
  },
  {
    path: ".github/workflows/launch-validation.yml",
    kind: "workflow",
    component: "Launch workflow",
    tags: ["mason", "workflow", "validation"],
    workflows: ["Launch Validation"],
  },
];

describe("Mason V2 engineering foundation", () => {
  it("loads the mandatory versioned Engineering Constitution as a runtime artifact", () => {
    const constitution = loadMasonEngineeringConstitution();
    expect(constitution).toMatchObject({
      artifactId: "mason.engineering-constitution",
      version: "1.0.0",
      mandatory: true,
    });
    expect(constitution.principles).toHaveLength(10);
    expect(constitution.principles.map((principle) => principle.id)).toEqual([
      "truth_before_speed",
      "repository_first",
      "minimal_correct_change",
      "safety_before_autonomy",
      "evidence_driven_engineering",
      "validation_required",
      "learn_only_verified_facts",
      "respect_existing_architecture",
      "explain_why",
      "founder_governance",
    ]);
    expect(constitution.principles.every((principle) => principle.engineeringBehavior.length >= 2)).toBe(true);
  });

  it("builds bounded deterministic Repository Intelligence without crawling", async () => {
    const manyRecords = Array.from({ length: 12 }, (_, index): RepositoryEvidenceRecord => ({
      path: `src/lib/mason/module-${String(index).padStart(2, "0")}.ts`,
      kind: "source",
      component: `Mason module ${index}`,
      tags: ["mason", "planning"],
      dependencies: [`src/lib/mason/dependency-${index}.ts`],
    }));
    manyRecords.push({
      path: "../../unsafe.ts",
      kind: "source",
      component: "Unsafe",
      tags: ["mason"],
    });
    const intelligence = createRepositoryIntelligence({
      objective: "Improve Mason planning",
      repository: "AIOS-HQ/aios-platform",
      evidenceSnapshot: manyRecords,
      limits: { maxEvidenceRecords: 3, maxRelatedFiles: 3, maxDependencies: 2 },
    });
    expect(intelligence.evidenceRecords).toHaveLength(3);
    expect(intelligence.relatedFiles).toEqual([
      "src/lib/mason/module-00.ts",
      "src/lib/mason/module-01.ts",
      "src/lib/mason/module-02.ts",
    ]);
    expect(intelligence.dependencyGraph).toHaveLength(2);
    expect(intelligence.truncated).toBe(true);
    expect(intelligence.unknowns).toContainEqual(expect.objectContaining({ field: "discarded_evidence" }));

    const hardBounded = createRepositoryIntelligence({
      objective: "Mason planning",
      evidenceSnapshot: Array.from({ length: 500 }, (_, index) => ({
        path: `src/mason-${index}.ts`,
        kind: "source" as const,
        component: `Mason ${index}`,
        tags: ["mason", "planning"],
      })),
      limits: { maxEvidenceRecords: 50_000, maxRelatedFiles: 50_000 },
    });
    expect(hardBounded.evidenceRecords.length).toBeLessThanOrEqual(40);
    expect(hardBounded.relatedFiles.length).toBeLessThanOrEqual(30);
    expect(hardBounded.truncated).toBe(true);

    const source = await readFile("src/lib/harmony/code/mason-engineering/repository-intelligence.ts", "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|readdir|glob\(|readFile/);
  });

  it("classifies missing repository facts as UNKNOWN rather than fabricating them", () => {
    const intelligence = createRepositoryIntelligence({
      objective: "Change an unknown API migration and workflow",
      repository: "external/unknown",
      evidenceSnapshot: [],
    });
    expect(intelligence.evidenceType).toBe("unknown");
    expect(intelligence.affectedFiles).toEqual([]);
    expect(intelligence.unknowns.map((unknown) => unknown.field)).toEqual(
      expect.arrayContaining(["repository_evidence", "affected_files", "related_tests", "migrations", "workflows", "apis"]),
    );
  });

  it("creates a deterministic Engineering Context Package with measurable confidence", () => {
    const intelligence = createRepositoryIntelligence({
      objective: "Fix Mason database planning workflow",
      repository: "AIOS-HQ/aios-platform",
      evidenceSnapshot: groundedEvidence,
    });
    const first = createEngineeringContextPackage({
      objective: "Fix Mason database planning workflow",
      constitutionVersion: "1.0.0",
      intelligence,
      rootCauseEvidence: "The planning adapter returns a placeholder instead of repository-grounded evidence.",
      alternatives: ["Keep placeholder planning", "Add unbounded repository crawling"],
      architectureNotes: ["Founder approval remains mandatory"],
      validationTargets: ["npm test", "npm run typecheck", "npm run lint", "npm run build", "git diff --check"],
      historicalPatternMatches: 1,
    });
    const second = createEngineeringContextPackage({
      objective: "Fix Mason database planning workflow",
      constitutionVersion: "1.0.0",
      intelligence,
      rootCauseEvidence: "The planning adapter returns a placeholder instead of repository-grounded evidence.",
      alternatives: ["Keep placeholder planning", "Add unbounded repository crawling"],
      architectureNotes: ["Founder approval remains mandatory"],
      validationTargets: ["npm test", "npm run typecheck", "npm run lint", "npm run build", "git diff --check"],
      historicalPatternMatches: 1,
    });
    expect(first.contextId).toBe(second.contextId);
    expect(first.relatedFiles.length).toBeGreaterThan(0);
    expect(first.relatedTests).toContain("tests/unit/mason.test.ts");
    expect(first.databaseObjects).toContain("mason_execution_ledger");
    expect(first.workflows).toEqual(expect.arrayContaining(["Launch Validation"]));
    expect(first.evidenceConfidence.method).toBe("measurable_repository_evidence_v1");
  });

  it("calculates confidence only from measurable evidence contributors", () => {
    const grounded = createRepositoryIntelligence({
      objective: "Fix Mason planning",
      repository: "AIOS-HQ/aios-platform",
      evidenceSnapshot: groundedEvidence,
    });
    const empty = createRepositoryIntelligence({ objective: "Unknown", evidenceSnapshot: [] });
    const high = calculateEngineeringConfidence({
      intelligence: grounded,
      architectureNoteCount: 2,
      validationTargetCount: 5,
      historicalPatternMatches: 2,
      unknownCount: 0,
      risk: "elevated",
    });
    const low = calculateEngineeringConfidence({
      intelligence: empty,
      architectureNoteCount: 0,
      validationTargetCount: 0,
      historicalPatternMatches: 0,
      unknownCount: 5,
      risk: "unknown",
    });
    expect(high.score).toBeGreaterThan(low.score);
    expect(Object.keys(high.breakdown)).toEqual([
      "repositoryGrounding",
      "architectureGrounding",
      "relatedTestCoverage",
      "historicalPatternMatch",
      "validationCoverage",
      "unknownPenalty",
      "riskPenalty",
    ]);
  });

  it("generates grounded plans only from an Engineering Context Package", () => {
    const foundation = createMasonEngineeringFoundation({
      objective: "Fix Mason database planning workflow",
      repository: "AIOS-HQ/aios-platform",
      evidenceSnapshot: groundedEvidence,
      rootCauseEvidence: "The runtime planning adapter returns a placeholder.",
      alternatives: ["Keep the placeholder", "Use unbounded crawling"],
      architectureNotes: ["Reuse existing Mason governance"],
      validationTargets: ["npm test", "npm run typecheck", "npm run lint", "npm run build", "git diff --check"],
    });
    expect(foundation.pipelineOrder).toEqual(MASON_ENGINEERING_PIPELINE_ORDER);
    expect(foundation.groundedPlan.contextId).toBe(foundation.contextPackage.contextId);
    expect(foundation.groundedPlan.status).toBe("ready_for_founder_review");
    expect(foundation.groundedPlan.rootCause).toContain("placeholder");
    expect(foundation.groundedPlan.filesExpectedToChange.length).toBeGreaterThan(0);
    expect(() => requireGroundedPlanReady(foundation.groundedPlan)).not.toThrow();
  });

  it("blocks planning when mandatory context is incomplete", () => {
    const foundation = createMasonEngineeringFoundation({
      objective: "Change an unknown external repository",
      repository: "external/unknown",
      evidenceSnapshot: [],
    });
    expect(foundation.groundedPlan.status).toBe("blocked_context_incomplete");
    expect(foundation.groundedPlan.rootCause).toBe("UNKNOWN");
    expect(foundation.groundedPlan.filesExpectedToChange).toEqual([]);
    expect(() => requireGroundedPlanReady(foundation.groundedPlan)).toThrow("mason_context_incomplete");
  });

  it("makes the context package mandatory for legacy and native Mason plans", () => {
    const legacy = createMasonExecutionPlan({
      title: "Fix Mason planning",
      repository: "AIOS-HQ/aios-platform",
      repositoryEvidence: groundedEvidence,
      rootCauseEvidence: "Placeholder planning is not grounded.",
    });
    const native = createMasonNativeRuntimePlan({
      objective: "Fix Mason planning",
      repository: "AIOS-HQ/aios-platform",
      repositoryEvidence: groundedEvidence,
      rootCauseEvidence: "Placeholder planning is not grounded.",
    });
    expect(legacy.engineeringFoundation.contextPackage.contextId).toMatch(/^mason-context-/);
    expect(native.engineeringFoundation.contextPackage.contextId).toBe(
      native.executionPlan.engineeringFoundation.contextPackage.contextId,
    );
    expect(legacy.implementationPlan[0]).toMatch(/^Current state:/);
  });

  it("preserves existing execution permissions and approval boundaries", async () => {
    const native = createMasonNativeRuntimePlan({
      objective: "Implement a Mason code change",
      repository: "AIOS-HQ/aios-platform",
    });
    expect(MASON_SAFE_EXECUTION_BOUNDARY).toMatchObject({
      founderApprovalRequiredForMerge: true,
      directProductionEditingAllowed: false,
      mergeWithoutFounderApprovalAllowed: false,
      destructiveOperationsAllowed: false,
    });
    expect(native.approvalGatedSteps.map((step) => step.id)).toEqual(
      expect.arrayContaining(["patch_generation", "pull_request"]),
    );
    expect(native.blockedSteps.some((step) => step.capabilityId === "delete_repository")).toBe(false);

    const actionSource = await readFile("src/lib/workforce/mason-action.ts", "utf8");
    expect(actionSource).not.toContain("Plan for:");
    expect(actionSource).toContain("createMasonNativeRuntimePlan");
    expect(actionSource.indexOf("createMasonNativeRuntimePlan")).toBeLessThan(
      actionSource.indexOf("runMasonProductionRuntime(runtimeInput)"),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  MASON_CAPABILITIES,
  MASON_SAFE_EXECUTION_BOUNDARY,
  classifyMasonEngineeringTask,
  createMasonExecutionPlan,
  createMasonNativeRuntimePlan,
  getMasonCapabilityRegistry,
  getMasonConnectorCapabilities,
  getMasonConnectorIds,
  isMasonRuntimeCapabilityAutonomous,
  isMasonFounderOnly,
  isMasonSubscriberFacing,
  masonOwnsEngineeringTask,
  requiresMasonFounderApproval,
} from "@/lib/harmony/code/mason";
import { buildAdaptivePlanFromSignals } from "@/lib/harmony/adaptive-planning";
import { PLANS } from "@/lib/billing/plans";
import { getDepartmentTemplate } from "@/lib/harmony/os/catalog";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";

const emptyOrganization: OrganizationalIntelligence = {
  strongestCollaboration: null,
  highestPerformingCollaboration: null,
  mostEffectivePattern: null,
  fastestImprovingMember: null,
  bottlenecks: [],
  collaborations: [],
  workforce: [],
  planningContext: "",
  generatedAt: new Date("2026-06-27T00:00:00.000Z").toISOString(),
  windowDays: 30,
  metrics: {
    collaborations: 0,
    completedExecutions: 0,
    blockedExecutions: 0,
    approvalFrequency: 0,
    averageCompletionHours: null,
    objectiveCompletionRate: 0,
    activitySignals: 0,
  },
};

describe("Mason founder engineering capability", () => {
  it("keeps Mason Founder-only and out of subscriber-facing access", () => {
    expect(isMasonFounderOnly()).toBe(true);
    expect(isMasonSubscriberFacing()).toBe(false);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.subscriberFacing).toBe(false);
    expect(JSON.stringify(PLANS).toLowerCase()).not.toContain("mason");
  });

  it("keeps Mason in the Code department without replacing Code support agents", () => {
    const code = getDepartmentTemplate("code");

    expect(code?.agents.map((agent) => agent.key)).toEqual([
      "engineering_manager",
      "mason",
      "qa",
      "testing",
      "deployment",
    ]);
  });

  it("classifies software, app, website, API, database, and deployment work for Mason", () => {
    for (const prompt of [
      "Build a founder website for AIOS",
      "Fix the API bug in the GitHub integration",
      "Refactor the Supabase database readiness module",
      "Prepare the Vercel deployment and build validation",
      "Create a mobile app architecture plan",
    ]) {
      expect(masonOwnsEngineeringTask(prompt)).toBe(true);
      expect(classifyMasonEngineeringTask(prompt).owner).toBe("mason");
    }
  });

  it("requires PR, preview, and Founder approval before code execution can merge", () => {
    expect(MASON_SAFE_EXECUTION_BOUNDARY.branchRequired).toBe(true);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.pullRequestRequired).toBe(true);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.vercelPreviewRequired).toBe(true);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.founderApprovalRequiredForMerge).toBe(true);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.directProductionEditingAllowed).toBe(false);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.mergeWithoutFounderApprovalAllowed).toBe(false);
    expect(MASON_SAFE_EXECUTION_BOUNDARY.destructiveOperationsAllowed).toBe(false);
    expect(requiresMasonFounderApproval("Implement a production security fix")).toBe(true);
  });

  it("exposes engineering capabilities as code-level contracts", () => {
    expect(MASON_CAPABILITIES.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
      "inspect_repositories",
      "classify_engineering_tasks",
      "create_implementation_plans",
      "generate_patch_plans",
      "recommend_files_to_change",
      "prepare_validation_steps",
      "coordinate_code_agents",
      "create_pr_ready_summaries",
        "analyze_architecture",
        "decompose_engineering_work",
        "generate_patches",
        "modify_files_on_branch",
        "run_validation_commands",
        "prepare_pull_request",
        "verify_vercel_preview",
        "produce_engineering_reports",
        "record_engineering_memory",
        "github.list_repos",
        "vercel.deployment_status",
      ]),
    );

    const plan = createMasonExecutionPlan({
      title: "Fix a GitHub integration bug",
      detail: "Prepare branch, tests, pull request, and Vercel preview validation.",
    });

    expect(plan.owner).toBe("mason");
    expect(plan.coordinationAgents).toEqual(["qa", "testing", "deployment"]);
    expect(plan.validationSteps).toContain("npm run build");
    expect(plan.prReadySummary).toContain("branch -> PR -> Vercel preview -> Founder approval -> merge");
  });

  it("builds a Founder-safe native runtime plan for engineering execution", () => {
    const plan = createMasonNativeRuntimePlan({
      objective: "Implement a SaaS API bug fix",
      detail: "Inspect repository, modify code on a branch, run tests, prepare PR, and verify Vercel preview.",
      repository: "AIOS-HQ/aios-platform",
    });

    expect(plan.provider).toBe("mason");
    expect(plan.repository).toBe("AIOS-HQ/aios-platform");
    expect(plan.automaticSteps.map((step) => step.id)).toEqual(
      expect.arrayContaining(["repository_inspection", "architecture_analysis", "validation", "learning"]),
    );
    expect(plan.approvalGatedSteps.map((step) => step.id)).toEqual(
      expect.arrayContaining(["patch_generation", "pull_request"]),
    );
    expect(plan.memoryPlan.evolveCompanySkills).toBe(true);
    expect(plan.memoryPlan.improveOrganizationalIntelligence).toBe(true);
    expect(plan.boundarySummary).toContain("Founder-approval gated");
  });

  it("keeps only routine non-mutating runtime capabilities autonomous", () => {
    const registry = getMasonCapabilityRegistry();
    const inspect = registry.find((capability) => capability.id === "inspect_repositories");
    const patch = registry.find((capability) => capability.id === "generate_patches");
    const merge = registry.find((capability) => capability.id === "github.merge_pull_request");
    const vercelRead = registry.find((capability) => capability.id === "vercel.deployment_status");

    expect(inspect && isMasonRuntimeCapabilityAutonomous(inspect)).toBe(true);
    expect(vercelRead && isMasonRuntimeCapabilityAutonomous(vercelRead)).toBe(true);
    expect(patch && isMasonRuntimeCapabilityAutonomous(patch)).toBe(false);
    expect(merge && isMasonRuntimeCapabilityAutonomous(merge)).toBe(false);
  });

  it("uses GitHub and Vercel connectors while excluding destructive or approval-bypassing capabilities", () => {
    expect(getMasonConnectorIds()).toEqual(["github", "vercel"]);

    const capabilities = getMasonConnectorCapabilities();
    expect(capabilities.some((entry) => entry.connector === "github")).toBe(true);
    expect(capabilities.some((entry) => entry.connector === "vercel")).toBe(true);
    expect(
      capabilities.find((entry) => entry.capability.id === "merge_pull_request")?.allowedForMason,
    ).toBe(false);
    expect(
      capabilities.find((entry) => entry.capability.id === "delete_repository")?.allowedForMason,
    ).toBe(false);
    expect(capabilities.find((entry) => entry.capability.id === "delete_env_var")?.allowedForMason).toBe(false);
    expect(capabilities.find((entry) => entry.capability.id === "list_deployments")?.allowedForMason).toBe(true);
  });

  it("routes engineering Adaptive Plans to Mason", () => {
    const plan = buildAdaptivePlanFromSignals({
      title: "Build a new AIOS website integration",
      detail: "Create code changes, tests, PR summary, and Vercel preview validation.",
      skills: [],
      organization: emptyOrganization,
    });

    expect(plan.recommendedWorkforce).toContain("mason");
    expect(plan.approvalCheckpoints).toContain("Engineering Implementation");
    expect(plan.executiveSummary).toContain("Mason will own software execution");
  });
});

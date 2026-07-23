import { contextPackageIsComplete } from "./context-package";
import type { EngineeringContextPackage, GroundedEngineeringPlan } from "./types";

function planId(contextId: string): string {
  return contextId.replace("mason-context-", "mason-plan-");
}

function approvalLevel(context: EngineeringContextPackage): GroundedEngineeringPlan["approvalLevel"] {
  return context.riskClassification === "routine" ? "founder_review" : "founder_approval_required";
}

export function createGroundedEngineeringPlan(context: EngineeringContextPackage): GroundedEngineeringPlan {
  const complete = contextPackageIsComplete(context);
  const evidencePaths = context.repositoryEvidence.evidenceRecords.map((record) => record.path);
  if (!complete) {
    return {
      schemaVersion: "1.0",
      planId: planId(context.contextId),
      contextId: context.contextId,
      status: "blocked_context_incomplete",
      currentState: "Repository context contains unresolved UNKNOWN evidence.",
      desiredState: context.objective,
      repositoryEvidence: evidencePaths,
      rootCause: context.rootCauseEvidence ?? "UNKNOWN",
      alternativesConsidered: context.alternatives,
      chosenSolution: "UNKNOWN — gather the missing repository and root-cause evidence before implementation planning.",
      filesExpectedToChange: [],
      validationPlan: context.validationTargets,
      rollbackStrategy: "No change is authorized while the grounded plan is incomplete.",
      approvalLevel: approvalLevel(context),
      engineeringConfidenceScore: context.evidenceConfidence,
    };
  }

  return {
    schemaVersion: "1.0",
    planId: planId(context.contextId),
    contextId: context.contextId,
    status: "ready_for_founder_review",
    currentState: `Verified repository evidence covers ${context.relatedFiles.length} related file(s) and ${context.relatedTests.length} test file(s).`,
    desiredState: context.objective,
    repositoryEvidence: evidencePaths,
    rootCause: context.rootCauseEvidence!,
    alternativesConsidered: context.alternatives.length > 0 ? context.alternatives : ["No verified alternative was supplied."],
    chosenSolution: "Apply the minimal change supported by the verified root cause and repository boundaries.",
    filesExpectedToChange: context.repositoryEvidence.affectedFiles,
    validationPlan: context.validationTargets,
    rollbackStrategy: "Revert only the scoped branch changes and preserve existing production state.",
    approvalLevel: approvalLevel(context),
    engineeringConfidenceScore: context.evidenceConfidence,
  };
}

export function requireGroundedPlanReady(plan: GroundedEngineeringPlan): GroundedEngineeringPlan {
  if (plan.status !== "ready_for_founder_review") {
    throw new Error("mason_context_incomplete");
  }
  return plan;
}

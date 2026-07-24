import { contextPackageIsComplete } from "./context-package";
import type { ArchitectureContextPackage, EngineeringContextPackage, GroundedEngineeringPlan } from "./types";
import type { KnowledgeContextPackage } from "./knowledge-types";

function planId(contextId: string): string {
  return contextId.replace("mason-context-", "mason-plan-");
}

function approvalLevel(context: EngineeringContextPackage): GroundedEngineeringPlan["approvalLevel"] {
  return context.riskClassification === "routine" ? "founder_review" : "founder_approval_required";
}

export function createGroundedEngineeringPlan(
  context: EngineeringContextPackage,
  architectureContext: ArchitectureContextPackage,
  knowledgeContext: KnowledgeContextPackage,
): GroundedEngineeringPlan {
  const complete = contextPackageIsComplete(context) && architectureContext.repositoryEvidence.length > 0 && knowledgeContext.evidence.length > 0;
  const evidencePaths = [...new Set([
    ...context.repositoryEvidence.evidenceRecords.map((record) => record.path),
    ...architectureContext.repositoryEvidence,
  ])].sort();
  if (!complete) {
    return {
      schemaVersion: "1.0",
      planId: planId(context.contextId),
      contextId: context.contextId,
      architectureContextId: architectureContext.contextId,
      knowledgeContextId: knowledgeContext.contextId,
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
    architectureContextId: architectureContext.contextId,
    knowledgeContextId: knowledgeContext.contextId,
    status: "ready_for_founder_review",
    currentState: `Verified repository evidence covers ${context.relatedFiles.length} related file(s), ${context.relatedTests.length} test file(s), and ${architectureContext.impactAnalysis.affectedSubsystems.length} affected subsystem(s).`,
    desiredState: context.objective,
    repositoryEvidence: evidencePaths,
    rootCause: context.rootCauseEvidence!,
    alternativesConsidered: context.alternatives.length > 0 ? context.alternatives : ["No verified alternative was supplied."],
    chosenSolution: "Apply the minimal change supported by the verified root cause, architecture impact, and protected boundaries.",
    filesExpectedToChange: [...new Set([
      ...context.repositoryEvidence.affectedFiles,
      ...architectureContext.impactAnalysis.affectedFiles,
    ])].sort(),
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

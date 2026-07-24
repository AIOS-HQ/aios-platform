import "server-only";

import type { MasonLiveFileChange } from "@/lib/harmony/code/mason-live-execution";
import type { MasonExecutionIdentity } from "@/lib/harmony/code/mason-execution-identity";
import {
  classifyMasonProtectedPaths,
  protectedPathApprovalRequired,
  type MasonProtectedResource,
} from "@/lib/harmony/code/mason-protected-paths";

export type MasonEngineeringRisk = "low" | "medium" | "high" | "critical";
export type MasonRequesterAuthorization = {
  role: "founder" | "admin" | "system";
  verified: boolean;
  source: "server_session" | "approved_payload" | "trusted_runtime";
};
export type MasonRequestedOutcome =
  | "plan_only"
  | "create_issue"
  | "create_branch"
  | "commit_changes"
  | "open_pull_request";

export interface MasonEngineeringTaskContract {
  version: "mason.engineering-task.v1";
  objective: string;
  repository: string;
  repositoryEvidenceReferences: string[];
  requestedOutcome: MasonRequestedOutcome;
  riskClassification: MasonEngineeringRisk;
  protectedResources: MasonProtectedResource[];
  expectedDeliverables: string[];
  validationRequirements: string[];
  approvalRequirements: {
    required: boolean;
    level: "founder" | null;
    reasons: string[];
  };
  executionIdentity: MasonExecutionIdentity;
  runtimeRequest: {
    baseBranch: string;
    branchName: string;
    fileChanges: MasonLiveFileChange[];
    openPullRequest: boolean;
    issueTitle: string | null;
    issueBody: string | null;
    issueLabels: string[];
  };
}

const DEFAULT_VALIDATION = [
  "npm run lint",
  "npm run typecheck",
  "npm test",
  "npm run i18n:check",
  "npm run build",
] as const;

function riskFor(input: {
  protectedResources: readonly MasonProtectedResource[];
  requestedOutcome: MasonRequestedOutcome;
  fileChanges: readonly MasonLiveFileChange[];
}): MasonEngineeringRisk {
  if (input.protectedResources.some((resource) => ["payments", "migrations", "github_workflows", "environment_handling"].includes(resource.kind))) return "critical";
  if (input.protectedResources.length > 0) return "high";
  if (input.fileChanges.length > 0 || input.requestedOutcome === "open_pull_request") return "medium";
  return "low";
}

function deliverablesFor(input: {
  requestedOutcome: MasonRequestedOutcome;
  branchName: string;
  fileChanges: readonly MasonLiveFileChange[];
}): string[] {
  switch (input.requestedOutcome) {
    case "create_issue": return ["One scoped GitHub issue with repository evidence."];
    case "create_branch": return [`Branch ${input.branchName} at the verified base.`];
    case "commit_changes": return input.fileChanges.map((change) => `Committed update to ${change.path}.`);
    case "open_pull_request": return [
      ...input.fileChanges.map((change) => `Committed update to ${change.path}.`),
      "One Draft pull request with validation requirements and Founder approval boundary.",
    ];
    default: return ["Grounded engineering plan; no repository mutation."];
  }
}

export function createMasonEngineeringTaskContract(input: {
  objective: string;
  repository: string;
  executionIdentity: MasonExecutionIdentity;
  requestedOutcome?: MasonRequestedOutcome;
  repositoryEvidenceReferences?: readonly string[];
  baseBranch?: string | null;
  branchName?: string | null;
  fileChanges?: readonly MasonLiveFileChange[];
  validationRequirements?: readonly string[];
  issueTitle?: string | null;
  issueBody?: string | null;
  issueLabels?: readonly string[];
}): MasonEngineeringTaskContract {
  const objective = input.objective.trim();
  const repository = input.repository.trim();
  if (!objective) throw new Error("mason_task_objective_required");
  if (!repository) throw new Error("mason_task_repository_required");

  const requestedOutcome = input.requestedOutcome ?? "plan_only";
  const fileChanges = [...(input.fileChanges ?? [])].map((change) => ({ ...change, path: change.path.trim() })).filter((change) => change.path && change.content.length > 0);
  const protectedResources = classifyMasonProtectedPaths([
    ...fileChanges.map((change) => change.path),
    ...(input.repositoryEvidenceReferences ?? []),
  ]);
  const branchName = input.branchName?.trim() || `mason/${input.executionIdentity.correlationId.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(-36) || "engineering-task"}`;
  const riskClassification = riskFor({ protectedResources, requestedOutcome, fileChanges });
  const approvalReasons = [
    ...(requestedOutcome === "plan_only" ? [] : ["Repository mutation requires existing Founder governance."]),
    ...protectedResources.map((resource) => `${resource.kind}:${resource.path}`),
  ];

  return Object.freeze({
    version: "mason.engineering-task.v1",
    objective,
    repository,
    repositoryEvidenceReferences: [...new Set(input.repositoryEvidenceReferences ?? [])].sort(),
    requestedOutcome,
    riskClassification,
    protectedResources,
    expectedDeliverables: deliverablesFor({ requestedOutcome, branchName, fileChanges }),
    validationRequirements: [...new Set(input.validationRequirements ?? DEFAULT_VALIDATION)],
    approvalRequirements: {
      required: requestedOutcome !== "plan_only" || protectedPathApprovalRequired(protectedResources),
      level: requestedOutcome !== "plan_only" || protectedResources.length > 0 ? ("founder" as const) : null,
      reasons: approvalReasons,
    },
    executionIdentity: input.executionIdentity,
    runtimeRequest: {
      baseBranch: input.baseBranch?.trim() || "main",
      branchName,
      fileChanges,
      openPullRequest: requestedOutcome === "open_pull_request",
      issueTitle: input.issueTitle?.trim() || null,
      issueBody: input.issueBody?.trim() || null,
      issueLabels: [...new Set(input.issueLabels ?? [])],
    },
  });
}

export function assertMasonTaskExecutable(task: MasonEngineeringTaskContract): void {
  if (task.requestedOutcome === "plan_only") {
    throw new Error("mason_task_has_no_execution_request");
  }
  if (
    (task.requestedOutcome === "commit_changes" || task.requestedOutcome === "open_pull_request") &&
    task.runtimeRequest.fileChanges.length === 0
  ) {
    throw new Error("mason_task_file_changes_required");
  }
}

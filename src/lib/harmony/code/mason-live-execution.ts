import {
  MASON_REQUIRED_VALIDATION_COMMANDS,
  canMasonMerge,
  canMasonOpenPullRequest,
  createMasonExecutionBridge,
  type MasonExecutionBridge,
  type MasonRequesterRole,
  type MasonValidationCommand,
} from "@/lib/harmony/code/mason-execution-bridge";
import {
  classifyMasonOperation,
  resolveMasonOperationApproval,
} from "@/lib/harmony/autonomy/mason-policy";

export interface MasonLiveFileChange {
  path: string;
  content: string;
  message?: string | null;
}

export type MasonLiveConnectorOperationKind =
  | "github_create_branch"
  | "github_commit_file"
  | "validation_request"
  | "github_open_pull_request"
  | "github_create_issue"
  | "vercel_check_preview"
  | "harmony_report_outcome"
  | "activity_record"
  | "review_queue_update"
  | "julius_memory_update"
  | "company_skill_update";

export interface MasonLiveConnectorOperation {
  kind: MasonLiveConnectorOperationKind;
  connectorId: "github" | "vercel" | "harmony";
  capabilityId: string;
  params: Record<string, unknown>;
  approved: boolean;
  summary: string;
}

export interface MasonLiveExecutionPlanInput {
  objective: string;
  repository: string;
  founderApproved: boolean;
  requesterRole?: MasonRequesterRole;
  baseBranch?: string | null;
  branchName?: string | null;
  fileChanges?: MasonLiveFileChange[];
  openPullRequest?: boolean;
  issueTitle?: string | null;
  issueBody?: string | null;
  issueLabels?: string[] | null;
  pullRequestUrl?: string | null;
  vercelPreviewUrl?: string | null;
}

export interface MasonLiveExecutionPlan {
  bridge: MasonExecutionBridge;
  status: "ready" | "approval_required" | "blocked";
  operations: MasonLiveConnectorOperation[];
  validationCommands: MasonValidationCommand[];
  validationRequest: string;
  prBody: string;
  reportingTargets: ["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"];
  outcomeSummary: string;
  blockedReason: string | null;
}

function cleanFileChanges(fileChanges?: MasonLiveFileChange[]): MasonLiveFileChange[] {
  return (fileChanges ?? []).filter((change) => change.path.trim() && change.content.length > 0);
}

function wantsDirectIssue(input: MasonLiveExecutionPlanInput, fileChanges: MasonLiveFileChange[]): boolean {
  return fileChanges.length === 0 && /\b(issue|ticket|github issue)\b/i.test(input.objective);
}

function wantsBranchOnly(input: MasonLiveExecutionPlanInput, fileChanges: MasonLiveFileChange[]): boolean {
  return (
    input.openPullRequest === false &&
    fileChanges.length === 0 &&
    /\b(create|new)\s+(a\s+)?branch\b/i.test(input.objective)
  );
}

function shouldOpenPullRequest(input: MasonLiveExecutionPlanInput): boolean {
  return input.openPullRequest === true;
}

function inferIssueTitle(input: MasonLiveExecutionPlanInput): string {
  const explicit = input.issueTitle?.trim();
  if (explicit) return explicit;

  const quoted = input.objective.match(/title:\s*["“]?([^"”\n]+)["”]?/i)?.[1]?.trim();
  if (quoted) return quoted.slice(0, 160);

  return input.objective.replace(/^harmony,?\s*/i, "").replace(/^ask mason to\s*/i, "").slice(0, 160);
}

function inferIssueBody(input: MasonLiveExecutionPlanInput): string {
  const explicit = input.issueBody?.trim();
  if (explicit) return explicit;
  return [
    "Created by Mason via Harmony autonomous execution.",
    "",
    `Original request: ${input.objective}`,
  ].join("\n");
}

function prBody(input: {
  bridge: MasonExecutionBridge;
  fileChanges: MasonLiveFileChange[];
  validationCommands: MasonValidationCommand[];
}): string {
  return [
    "## Summary",
    input.bridge.pullRequest.summary,
    "",
    "## Files changed",
    input.fileChanges.length
      ? input.fileChanges.map((change) => `- ${change.path}`).join("\n")
      : "- No file mutations were supplied to Mason for this execution.",
    "",
    "## Validation requested",
    input.validationCommands.map((command) => `- ${command}`).join("\n"),
    "",
    "## Risks and gates",
    input.bridge.pullRequest.risks.map((risk) => `- ${risk}`).join("\n"),
    "- Mason cannot merge this PR; Founder approval is still required.",
  ].join("\n");
}

function validationRequest(commands: MasonValidationCommand[]): string {
  return `Run or verify: ${commands.join(", ")}.`;
}

function outcomeSummary(input: {
  bridge: MasonExecutionBridge;
  status: MasonLiveExecutionPlan["status"];
  pullRequestUrl?: string | null;
  vercelPreviewUrl?: string | null;
  issueTitle?: string | null;
  branchOnly?: boolean;
  commitOnly?: boolean;
}): string {
  return [
    `Mason live execution status: ${input.status}.`,
    `Repository: ${input.bridge.scopedPlan.repository}.`,
    `Branch: ${input.bridge.scopedPlan.branchName}.`,
    input.branchOnly
      ? "Branch-only execution: no pull request requested."
      : input.commitOnly
        ? "Commit-only execution: no pull request requested."
        : input.issueTitle
          ? `Issue: ${input.issueTitle}.`
          : `PR: ${input.pullRequestUrl ?? "not opened yet"}.`,
    `Preview: ${input.vercelPreviewUrl ?? "not inspected yet"}.`,
  ].join(" ");
}

function reportingOperations(input: {
  bridge: MasonExecutionBridge;
  summary: string;
}): MasonLiveConnectorOperation[] {
  const params = {
    repository: input.bridge.scopedPlan.repository,
    branch: input.bridge.scopedPlan.branchName,
    objective: input.bridge.scopedPlan.objective,
    summary: input.summary,
    targets: input.bridge.reporting.targets,
  };

  return [
    {
      kind: "harmony_report_outcome",
      connectorId: "harmony",
      capabilityId: "report_mason_execution_outcome",
      approved: true,
      params,
      summary: "Report Mason execution status through Harmony.",
    },
    {
      kind: "activity_record",
      connectorId: "harmony",
      capabilityId: "emit_activity",
      approved: true,
      params,
      summary: "Record Mason execution activity.",
    },
    {
      kind: "review_queue_update",
      connectorId: "harmony",
      capabilityId: "update_review_queue",
      approved: true,
      params,
      summary: "Update Founder Review Queue with PR, preview, validation, and merge gate status.",
    },
    {
      kind: "julius_memory_update",
      connectorId: "harmony",
      capabilityId: "update_julius_memory",
      approved: true,
      params,
      summary: "Store Mason execution memory in Julius.",
    },
    {
      kind: "company_skill_update",
      connectorId: "harmony",
      capabilityId: "update_company_skills",
      approved: true,
      params,
      summary: "Update Company Skills with reusable engineering execution learning.",
    },
  ];
}

/**
 * Route every emitted operation through the Unified Autonomy Policy Engine:
 * drop actions Mason may never perform (e.g., repository deletion) and let the
 * engine — not local flags — decide each operation's final approval state.
 * Governed routine writes inherit the Founder-approved execution scope;
 * approval- or destructive-class actions are never auto-approved by scope.
 */
function governMasonOperations(
  operations: MasonLiveConnectorOperation[],
): MasonLiveConnectorOperation[] {
  return operations
    .filter(
      (operation) =>
        classifyMasonOperation(operation.kind, operation.capabilityId).allowedForMason,
    )
    .map((operation) => ({
      ...operation,
      approved: resolveMasonOperationApproval(
        operation.kind,
        operation.capabilityId,
        operation.approved,
        true,
      ),
    }));
}

export function createMasonLiveExecutionPlan(input: MasonLiveExecutionPlanInput): MasonLiveExecutionPlan {
  const fileChanges = cleanFileChanges(input.fileChanges);
  const bridge = createMasonExecutionBridge({
    objective: input.objective,
    repository: input.repository,
    requesterRole: input.requesterRole ?? "founder",
    founderApproved: input.founderApproved,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    changedFiles: fileChanges.map((change) => change.path),
  });
  const validationCommands = MASON_REQUIRED_VALIDATION_COMMANDS;
  const body = prBody({ bridge, fileChanges, validationCommands });
  const reportingTargets = bridge.reporting.targets;

  if (!bridge.access.allowed || !bridge.scopedPlan.engineeringPromptRoutesToMason) {
    const status = "blocked" as const;
    return {
      bridge,
      status,
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      reportingTargets,
      outcomeSummary: outcomeSummary({ bridge, status, pullRequestUrl: input.pullRequestUrl, vercelPreviewUrl: input.vercelPreviewUrl }),
      blockedReason: "Mason live execution is blocked because access or engineering routing failed.",
    };
  }

  if (!bridge.mutation.allowed || !canMasonOpenPullRequest(bridge)) {
    const status = "approval_required" as const;
    return {
      bridge,
      status,
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      reportingTargets,
      outcomeSummary: outcomeSummary({ bridge, status, pullRequestUrl: input.pullRequestUrl, vercelPreviewUrl: input.vercelPreviewUrl }),
      blockedReason: "Founder approval is required before Mason can create a branch, mutate files, open a PR, or create a GitHub issue.",
    };
  }

  if (canMasonMerge(bridge)) {
    const status = "blocked" as const;
    return {
      bridge,
      status,
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      reportingTargets,
      outcomeSummary: outcomeSummary({ bridge, status, pullRequestUrl: input.pullRequestUrl, vercelPreviewUrl: input.vercelPreviewUrl }),
      blockedReason: "Mason live execution cannot proceed with merge authority enabled.",
    };
  }

  const status = "ready" as const;
  const issueTitle = inferIssueTitle(input);
  const issueBody = inferIssueBody(input);
  const openPr = shouldOpenPullRequest(input);

  if (wantsDirectIssue(input, fileChanges)) {
    const summary = outcomeSummary({
      bridge,
      status,
      issueTitle,
      vercelPreviewUrl: input.vercelPreviewUrl,
    });
    const operations: MasonLiveConnectorOperation[] = [
      {
        kind: "github_create_issue",
        connectorId: "github",
        capabilityId: "create_issue",
        approved: true,
        params: {
          repo: bridge.scopedPlan.repository,
          title: issueTitle,
          body: issueBody,
          labels: input.issueLabels ?? [],
        },
        summary: `Create GitHub issue: ${issueTitle}.`,
      },
      ...reportingOperations({ bridge, summary }),
    ];

    return {
      bridge,
      status,
      operations: governMasonOperations(operations),
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      reportingTargets,
      outcomeSummary: summary,
      blockedReason: null,
    };
  }

  if (wantsBranchOnly(input, fileChanges)) {
    const summary = outcomeSummary({
      bridge,
      status,
      branchOnly: true,
      vercelPreviewUrl: input.vercelPreviewUrl,
    });
    const operations: MasonLiveConnectorOperation[] = [
      {
        kind: "github_create_branch",
        connectorId: "github",
        capabilityId: "create_branch",
        approved: true,
        params: {
          repo: bridge.scopedPlan.repository,
          branch: bridge.scopedPlan.branchName,
          base: bridge.scopedPlan.baseBranch,
        },
        summary: `Create branch ${bridge.scopedPlan.branchName} from ${bridge.scopedPlan.baseBranch}.`,
      },
      ...reportingOperations({ bridge, summary }),
    ];

    return {
      bridge,
      status,
      operations: governMasonOperations(operations),
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      reportingTargets,
      outcomeSummary: summary,
      blockedReason: null,
    };
  }

  const summary = outcomeSummary({
    bridge,
    status,
    pullRequestUrl: input.pullRequestUrl,
    vercelPreviewUrl: input.vercelPreviewUrl,
    commitOnly: fileChanges.length > 0 && !openPr,
  });
  const operations: MasonLiveConnectorOperation[] = [
    {
      kind: "github_create_branch",
      connectorId: "github",
      capabilityId: "create_branch",
      approved: true,
      params: {
        repo: bridge.scopedPlan.repository,
        branch: bridge.scopedPlan.branchName,
        base: bridge.scopedPlan.baseBranch,
      },
      summary: `Create scoped execution branch ${bridge.scopedPlan.branchName}.`,
    },
    ...fileChanges.map((change) => ({
      kind: "github_commit_file" as const,
      connectorId: "github" as const,
      capabilityId: "commit_file_to_branch",
      approved: true,
      params: {
        repo: bridge.scopedPlan.repository,
        branch: bridge.scopedPlan.branchName,
        path: change.path,
        content: change.content,
        message: change.message?.trim() || `Mason update ${change.path}`,
      },
      summary: `Commit ${change.path} to ${bridge.scopedPlan.branchName}.`,
    })),
    {
      kind: "validation_request",
      connectorId: "harmony",
      capabilityId: "request_validation_commands",
      approved: true,
      params: {
        repo: bridge.scopedPlan.repository,
        branch: bridge.scopedPlan.branchName,
        commands: validationCommands,
      },
      summary: validationRequest(validationCommands),
    },
  ];

  if (openPr) {
    operations.push({
      kind: "github_open_pull_request",
      connectorId: "github",
      capabilityId: "open_pull_request",
      approved: true,
      params: {
        repo: bridge.scopedPlan.repository,
        title: bridge.pullRequest.title,
        head: bridge.scopedPlan.branchName,
        base: bridge.scopedPlan.baseBranch,
        body,
      },
      summary: "Open a PR with summary, risks, validation request, and Founder approval boundary.",
    });

    operations.push({
      kind: "vercel_check_preview",
      connectorId: "vercel",
      capabilityId: "deployment_status",
      approved: false,
      params: {
        repo: bridge.scopedPlan.repository,
        branch: bridge.scopedPlan.branchName,
        objective: bridge.scopedPlan.objective,
        previewUrl: input.vercelPreviewUrl ?? null,
      },
      summary: "Request Vercel preview/build status after PR creation.",
    });
  }

  operations.push(...reportingOperations({ bridge, summary }));

  return {
    bridge,
    status,
    operations: governMasonOperations(operations),
    validationCommands,
    validationRequest: validationRequest(validationCommands),
    prBody: body,
    reportingTargets,
    outcomeSummary: summary,
    blockedReason: null,
  };
}

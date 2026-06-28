import {
  MASON_REQUIRED_VALIDATION_COMMANDS,
  canMasonMerge,
  canMasonOpenPullRequest,
  createMasonExecutionBridge,
  type MasonExecutionBridge,
  type MasonValidationCommand,
} from "@/lib/harmony/code/mason-execution-bridge";

export interface MasonLiveFileChange {
  path: string;
  content: string;
  message?: string | null;
}

export type MasonLiveConnectorOperationKind =
  | "github_create_branch"
  | "github_commit_file"
  | "github_open_pull_request"
  | "vercel_check_preview";

export interface MasonLiveConnectorOperation {
  kind: MasonLiveConnectorOperationKind;
  connectorId: "github" | "vercel";
  capabilityId: string;
  params: Record<string, unknown>;
  approved: boolean;
  summary: string;
}

export interface MasonLiveExecutionPlanInput {
  objective: string;
  repository: string;
  founderApproved: boolean;
  baseBranch?: string | null;
  branchName?: string | null;
  fileChanges?: MasonLiveFileChange[];
  openPullRequest?: boolean;
}

export interface MasonLiveExecutionPlan {
  bridge: MasonExecutionBridge;
  status: "ready" | "approval_required" | "blocked";
  operations: MasonLiveConnectorOperation[];
  validationCommands: MasonValidationCommand[];
  validationRequest: string;
  prBody: string;
  blockedReason: string | null;
}

function cleanFileChanges(fileChanges?: MasonLiveFileChange[]): MasonLiveFileChange[] {
  return (fileChanges ?? []).filter((change) => change.path.trim() && change.content.length > 0);
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

export function createMasonLiveExecutionPlan(input: MasonLiveExecutionPlanInput): MasonLiveExecutionPlan {
  const fileChanges = cleanFileChanges(input.fileChanges);
  const bridge = createMasonExecutionBridge({
    objective: input.objective,
    repository: input.repository,
    requesterRole: "founder",
    founderApproved: input.founderApproved,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    changedFiles: fileChanges.map((change) => change.path),
  });
  const validationCommands = MASON_REQUIRED_VALIDATION_COMMANDS;
  const body = prBody({ bridge, fileChanges, validationCommands });

  if (!bridge.access.allowed || !bridge.scopedPlan.engineeringPromptRoutesToMason) {
    return {
      bridge,
      status: "blocked",
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      blockedReason: "Mason live execution is blocked because access or engineering routing failed.",
    };
  }

  if (!bridge.mutation.allowed || !canMasonOpenPullRequest(bridge)) {
    return {
      bridge,
      status: "approval_required",
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      blockedReason: "Founder approval is required before Mason can create a branch, mutate files, or open a PR.",
    };
  }

  if (canMasonMerge(bridge)) {
    return {
      bridge,
      status: "blocked",
      operations: [],
      validationCommands,
      validationRequest: validationRequest(validationCommands),
      prBody: body,
      blockedReason: "Mason live execution cannot proceed with merge authority enabled.",
    };
  }

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
  ];

  if (input.openPullRequest !== false) {
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
  }

  operations.push({
    kind: "vercel_check_preview",
    connectorId: "vercel",
    capabilityId: "deployment_status",
    approved: false,
    params: {
      repo: bridge.scopedPlan.repository,
      branch: bridge.scopedPlan.branchName,
      objective: bridge.scopedPlan.objective,
    },
    summary: "Request Vercel preview/build status after PR creation.",
  });

  return {
    bridge,
    status: "ready",
    operations,
    validationCommands,
    validationRequest: validationRequest(validationCommands),
    prBody: body,
    blockedReason: null,
  };
}

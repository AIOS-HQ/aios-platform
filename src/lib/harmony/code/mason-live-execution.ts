import {
  MASON_REQUIRED_VALIDATION_COMMANDS,
  canMasonOpenPullRequest,
  createMasonExecutionBridge,
  type MasonExecutionBridge,
  type MasonExecutionBridgeRequest,
  type MasonValidationCommand,
} from "@/lib/harmony/code/mason-execution-bridge";

export type MasonLiveExecutionActionStatus = "ready" | "blocked" | "completed" | "failed" | "not_requested";
export type MasonLiveExecutionActionKind =
  | "github.create_branch"
  | "github.update_file"
  | "validation.request"
  | "github.create_pull_request"
  | "vercel.inspect_preview"
  | "harmony.report_outcome";

export interface MasonFilePatchInstruction {
  path: string;
  summary: string;
  operation: "create" | "update";
}

export interface MasonLiveExecutionRequest extends MasonExecutionBridgeRequest {
  filePatches?: MasonFilePatchInstruction[];
  pullRequestUrl?: string | null;
  vercelPreviewUrl?: string | null;
  validationResults?: Partial<Record<MasonValidationCommand, "passed" | "failed" | "not_run">>;
}

export interface MasonLiveExecutionAction {
  kind: MasonLiveExecutionActionKind;
  status: MasonLiveExecutionActionStatus;
  connector: "github" | "vercel" | "harmony";
  requiresFounderApproval: boolean;
  summary: string;
}

export interface MasonLiveExecutionWiring {
  bridge: MasonExecutionBridge;
  status: "ready_for_live_execution" | "paused_for_founder_approval" | "blocked";
  github: {
    repository: string;
    baseBranch: string;
    executionBranch: string;
    canCreateBranch: boolean;
    canEditFiles: boolean;
    canOpenPullRequest: boolean;
    filePatches: MasonFilePatchInstruction[];
    pullRequestTitle: string;
    pullRequestBody: string;
  };
  validation: {
    canRequestValidation: boolean;
    commands: MasonValidationCommand[];
    results: Record<MasonValidationCommand, "passed" | "failed" | "not_run">;
    allRequiredCommandsAccountedFor: boolean;
  };
  vercel: {
    canInspectPreview: boolean;
    previewUrl: string | null;
    requiresPreviewBeforeMerge: true;
  };
  reporting: {
    canReportOutcome: boolean;
    targets: ["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"];
    outcomeSummary: string;
  };
  actions: MasonLiveExecutionAction[];
}

function allValidationCommandsAccountedFor(
  results: Record<MasonValidationCommand, "passed" | "failed" | "not_run">,
): boolean {
  return MASON_REQUIRED_VALIDATION_COMMANDS.every((command) => results[command] !== undefined);
}

function liveStatus(bridge: MasonExecutionBridge): MasonLiveExecutionWiring["status"] {
  if (bridge.status === "blocked") return "blocked";
  if (!bridge.mutation.allowed) return "paused_for_founder_approval";
  return "ready_for_live_execution";
}

function action(input: MasonLiveExecutionAction): MasonLiveExecutionAction {
  return input;
}

function prBody(input: { bridge: MasonExecutionBridge; request: MasonLiveExecutionRequest }): string {
  const patchSummary = input.request.filePatches?.length
    ? input.request.filePatches.map((patch) => `- ${patch.operation}: ${patch.path} — ${patch.summary}`).join("\n")
    : "- No file patches have been applied yet.";

  return [
    "## Summary",
    input.bridge.pullRequest.summary,
    "",
    "## Files changed",
    patchSummary,
    "",
    "## Validation",
    MASON_REQUIRED_VALIDATION_COMMANDS.map((command) => `- ${command}: ${input.bridge.validation.results[command]}`).join("\n"),
    "",
    "## Risks",
    input.bridge.pullRequest.risks.map((risk) => `- ${risk}`).join("\n"),
    "",
    "## Founder approval",
    "Merge remains blocked until explicit Founder approval after PR and preview review.",
  ].join("\n");
}

export function createMasonLiveExecutionWiring(input: MasonLiveExecutionRequest): MasonLiveExecutionWiring {
  const bridge = createMasonExecutionBridge(input);
  const status = liveStatus(bridge);
  const liveAllowed = status === "ready_for_live_execution";
  const filePatches = input.filePatches ?? [];
  const validationResults = bridge.validation.results;
  const canOpenPr = canMasonOpenPullRequest(bridge);
  const canReportOutcome = bridge.access.allowed && bridge.scopedPlan.engineeringPromptRoutesToMason;

  return {
    bridge,
    status,
    github: {
      repository: bridge.scopedPlan.repository,
      baseBranch: bridge.scopedPlan.baseBranch,
      executionBranch: bridge.scopedPlan.branchName,
      canCreateBranch: liveAllowed,
      canEditFiles: liveAllowed && filePatches.length > 0,
      canOpenPullRequest: canOpenPr,
      filePatches,
      pullRequestTitle: bridge.pullRequest.title,
      pullRequestBody: prBody({ bridge, request: input }),
    },
    validation: {
      canRequestValidation: bridge.validation.canRequestValidation,
      commands: MASON_REQUIRED_VALIDATION_COMMANDS,
      results: validationResults,
      allRequiredCommandsAccountedFor: allValidationCommandsAccountedFor(validationResults),
    },
    vercel: {
      canInspectPreview: bridge.access.allowed,
      previewUrl: input.vercelPreviewUrl ?? null,
      requiresPreviewBeforeMerge: true,
    },
    reporting: {
      canReportOutcome,
      targets: bridge.reporting.targets,
      outcomeSummary: [
        `Mason live execution status: ${status}.`,
        `Branch: ${bridge.scopedPlan.branchName}.`,
        `PR: ${input.pullRequestUrl ?? "not opened yet"}.`,
        `Preview: ${input.vercelPreviewUrl ?? "not inspected yet"}.`,
      ].join(" "),
    },
    actions: [
      action({
        kind: "github.create_branch",
        connector: "github",
        status: liveAllowed ? "ready" : "blocked",
        requiresFounderApproval: true,
        summary: `Create ${bridge.scopedPlan.branchName} from ${bridge.scopedPlan.baseBranch}.`,
      }),
      action({
        kind: "github.update_file",
        connector: "github",
        status: liveAllowed && filePatches.length > 0 ? "ready" : "not_requested",
        requiresFounderApproval: true,
        summary: `Apply ${filePatches.length} approved file patch(es) on ${bridge.scopedPlan.branchName}.`,
      }),
      action({
        kind: "validation.request",
        connector: "harmony",
        status: bridge.validation.canRequestValidation ? "ready" : "blocked",
        requiresFounderApproval: false,
        summary: `Request validation: ${MASON_REQUIRED_VALIDATION_COMMANDS.join(", ")}.`,
      }),
      action({
        kind: "github.create_pull_request",
        connector: "github",
        status: canOpenPr ? "ready" : "blocked",
        requiresFounderApproval: true,
        summary: `Open PR from ${bridge.scopedPlan.branchName} to ${bridge.scopedPlan.baseBranch}.`,
      }),
      action({
        kind: "vercel.inspect_preview",
        connector: "vercel",
        status: bridge.access.allowed ? "ready" : "blocked",
        requiresFounderApproval: false,
        summary: "Inspect Vercel preview/build status before merge approval.",
      }),
      action({
        kind: "harmony.report_outcome",
        connector: "harmony",
        status: canReportOutcome ? "ready" : "blocked",
        requiresFounderApproval: false,
        summary: "Report live execution status to Activity, Review Queue, Outcomes, Julius, and Company Skills.",
      }),
    ],
  };
}

export function getReadyMasonLiveActions(wiring: MasonLiveExecutionWiring): MasonLiveExecutionAction[] {
  return wiring.actions.filter((item) => item.status === "ready");
}

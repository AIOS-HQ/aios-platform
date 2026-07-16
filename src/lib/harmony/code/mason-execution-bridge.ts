import {
  MASON_AGENT_KEY,
  MASON_SAFE_EXECUTION_BOUNDARY,
  createMasonNativeRuntimePlan,
  masonOwnsEngineeringTask,
  type MasonNativeRuntimePlan,
} from "@/lib/harmony/code/mason";
import {
  toMasonBridgeStatus,
  type MasonRuntimeState,
} from "@/lib/harmony/code/mason-runtime-state";

export type MasonRequesterRole = "founder" | "subscriber";
export type MasonBridgeStatus = "ready" | "paused_for_founder_approval" | "blocked";

export interface MasonExecutionBridgeRequest {
  objective: string;
  repository: string;
  requesterRole: MasonRequesterRole;
  founderApproved: boolean;
  baseBranch?: string | null;
  branchName?: string | null;
  changedFiles?: string[];
  validationResults?: Partial<Record<MasonValidationCommand, "passed" | "failed" | "not_run">>;
}

export type MasonValidationCommand =
  | "npm run lint"
  | "npm run typecheck"
  | "npm test"
  | "npm run i18n:check"
  | "npm run build";

export interface MasonExecutionBridge {
  provider: typeof MASON_AGENT_KEY;
  routedBy: "harmony_aeo";
  runtimePlan: MasonNativeRuntimePlan;
  status: MasonBridgeStatus;
  access: {
    founderOnly: true;
    subscriberFacing: false;
    allowed: boolean;
    reason: string;
  };
  scopedPlan: {
    objective: string;
    repository: string;
    baseBranch: string;
    branchName: string;
    engineeringPromptRoutesToMason: boolean;
    steps: string[];
  };
  mutation: {
    allowed: boolean;
    requiresFounderApproval: true;
    branchRequired: true;
    productionDirectEditAllowed: false;
    destructiveActionsAllowed: false;
    reason: string;
  };
  validation: {
    commands: MasonValidationCommand[];
    results: Record<MasonValidationCommand, "passed" | "failed" | "not_run">;
    canRequestValidation: boolean;
  };
  pullRequest: {
    required: true;
    canOpen: boolean;
    title: string;
    summary: string;
    risks: string[];
    validation: MasonValidationCommand[];
  };
  reporting: {
    updatesActivity: true;
    updatesReviewQueue: true;
    updatesOutcomes: true;
    updatesJulius: true;
    updatesCompanySkills: true;
    targets: ["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"];
  };
  mergePolicy: {
    founderApprovalRequired: true;
    masonCanMergeWithoutApproval: false;
    mergeAllowedNow: false;
    reason: string;
  };
}

export const MASON_REQUIRED_VALIDATION_COMMANDS: MasonValidationCommand[] = [
  "npm run lint",
  "npm run typecheck",
  "npm test",
  "npm run i18n:check",
  "npm run build",
];

function normalizeBranchSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function defaultBranchName(objective: string): string {
  const suffix = normalizeBranchSegment(objective) || "engineering-task";
  return `mason/${suffix}`;
}

function validationResults(
  input: MasonExecutionBridgeRequest["validationResults"],
): Record<MasonValidationCommand, "passed" | "failed" | "not_run"> {
  return MASON_REQUIRED_VALIDATION_COMMANDS.reduce(
    (results, command) => ({ ...results, [command]: input?.[command] ?? "not_run" }),
    {} as Record<MasonValidationCommand, "passed" | "failed" | "not_run">,
  );
}

function bridgeStatus(input: {
  accessAllowed: boolean;
  routesToMason: boolean;
  founderApproved: boolean;
}): MasonBridgeStatus {
  const state: MasonRuntimeState =
    !input.accessAllowed || !input.routesToMason
      ? "blocked"
      : !input.founderApproved
        ? "awaiting_founder_approval"
        : "ready";
  return toMasonBridgeStatus(state);
}

export function createMasonExecutionBridge(input: MasonExecutionBridgeRequest): MasonExecutionBridge {
  const routesToMason = masonOwnsEngineeringTask(input.objective);
  const accessAllowed = input.requesterRole === "founder";
  const baseBranch = input.baseBranch?.trim() || "main";
  const branchName = input.branchName?.trim() || defaultBranchName(input.objective);
  const runtimePlan = createMasonNativeRuntimePlan({
    objective: input.objective,
    repository: input.repository,
  });
  const mutationAllowed = accessAllowed && routesToMason && input.founderApproved;
  const status = bridgeStatus({ accessAllowed, routesToMason, founderApproved: input.founderApproved });

  return {
    provider: MASON_AGENT_KEY,
    routedBy: "harmony_aeo",
    runtimePlan,
    status,
    access: {
      founderOnly: true,
      subscriberFacing: false,
      allowed: accessAllowed,
      reason: accessAllowed
        ? "Founder-only engineering provider access confirmed."
        : "Mason is Founder-only and must never be exposed to subscribers.",
    },
    scopedPlan: {
      objective: input.objective,
      repository: input.repository,
      baseBranch,
      branchName,
      engineeringPromptRoutesToMason: routesToMason,
      steps: [
        "Harmony/AEO routes engineering objective to Mason.",
        "Mason prepares a scoped branch, file, validation, PR, and approval plan.",
        "Founder approval is required before branch mutation or PR-opening execution.",
        "Mason applies code changes only on the scoped branch.",
        "Mason validates, prepares PR evidence, and reports back to Harmony.",
      ],
    },
    mutation: {
      allowed: mutationAllowed,
      requiresFounderApproval: true,
      branchRequired: MASON_SAFE_EXECUTION_BOUNDARY.branchRequired,
      productionDirectEditAllowed: MASON_SAFE_EXECUTION_BOUNDARY.directProductionEditingAllowed,
      destructiveActionsAllowed: MASON_SAFE_EXECUTION_BOUNDARY.destructiveOperationsAllowed,
      reason: mutationAllowed
        ? `Approved mutation may occur only on ${branchName}; direct production edits remain blocked.`
        : "Mutation is paused until the Founder approves the scoped branch/PR execution boundary.",
    },
    validation: {
      commands: MASON_REQUIRED_VALIDATION_COMMANDS,
      results: validationResults(input.validationResults),
      canRequestValidation: accessAllowed && routesToMason,
    },
    pullRequest: {
      required: true,
      canOpen: mutationAllowed,
      title: `Mason execution bridge: ${input.objective}`,
      summary: [
        runtimePlan.executionPlan.prReadySummary,
        `Branch: ${branchName}.`,
        `Files changed: ${(input.changedFiles?.length ? input.changedFiles : ["pending scoped implementation"]).join(", ")}.`,
      ].join(" "),
      risks: [
        "Merge remains blocked until explicit Founder approval.",
        "Production direct edits and destructive operations are not allowed.",
        "Subscriber-facing Mason access remains disabled.",
      ],
      validation: MASON_REQUIRED_VALIDATION_COMMANDS,
    },
    reporting: {
      updatesActivity: true,
      updatesReviewQueue: true,
      updatesOutcomes: true,
      updatesJulius: true,
      updatesCompanySkills: true,
      targets: ["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"],
    },
    mergePolicy: {
      founderApprovalRequired: true,
      masonCanMergeWithoutApproval: MASON_SAFE_EXECUTION_BOUNDARY.mergeWithoutFounderApprovalAllowed,
      mergeAllowedNow: false,
      reason: "Mason may prepare branches, validation, previews, and PRs, but the Founder must approve merge separately.",
    },
  };
}

export function canMasonOpenPullRequest(bridge: MasonExecutionBridge): boolean {
  return bridge.access.allowed && bridge.mutation.allowed && bridge.pullRequest.canOpen;
}

export function canMasonMerge(bridge: MasonExecutionBridge): boolean {
  return bridge.mergePolicy.mergeAllowedNow;
}

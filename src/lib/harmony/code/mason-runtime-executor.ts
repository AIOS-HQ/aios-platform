import {
  createMasonLiveExecutionPlan,
  type MasonLiveConnectorOperation,
  type MasonLiveExecutionPlan,
  type MasonLiveExecutionPlanInput,
} from "@/lib/harmony/code/mason-live-execution";
import { evaluateMasonOperationGate } from "@/lib/harmony/autonomy/mason-policy";
import {
  transitionMasonRuntimeState,
  type MasonRuntimeState,
} from "@/lib/harmony/code/mason-runtime-state";
import {
  classifyRollbackTrigger,
  createMasonRollbackPlan,
  executeMasonRollbackPlan,
  type MasonRollbackResult,
} from "@/lib/harmony/code/mason-rollback";

export type MasonRuntimeExecutionStatus = "completed" | "blocked" | "failed";
export type MasonRuntimeOperationStatus = "completed" | "blocked" | "failed" | "skipped";

export interface MasonRuntimeOperationResult {
  operation: MasonLiveConnectorOperation;
  status: MasonRuntimeOperationStatus;
  summary: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface MasonGithubRuntimeAdapter {
  createBranch(input: { repository: string; branch: string; base: string }): Promise<Record<string, unknown>>;
  commitFile(input: { repository: string; branch: string; path: string; content: string; message: string }): Promise<Record<string, unknown>>;
  openPullRequest(input: { repository: string; title: string; head: string; base: string; body: string }): Promise<Record<string, unknown>>;
  createIssue(input: { repository: string; title: string; body?: string | null; labels?: string[] | null }): Promise<Record<string, unknown>>;
  closePullRequest?(input: { repository: string; prNumber: number }): Promise<Record<string, unknown>>;
}

export interface MasonVercelRuntimeAdapter {
  inspectPreview(input: { repository: string; branch: string; objective: string; previewUrl?: string | null }): Promise<Record<string, unknown>>;
}

export interface MasonHarmonyRuntimeAdapter {
  requestValidation(input: { repository: string; branch: string; commands: string[] }): Promise<Record<string, unknown>>;
  reportOutcome(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  recordActivity(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateReviewQueue(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateJuliusMemory(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateCompanySkills(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface MasonRuntimeExecutorAdapters {
  github: MasonGithubRuntimeAdapter;
  vercel: MasonVercelRuntimeAdapter;
  harmony: MasonHarmonyRuntimeAdapter;
}

export interface MasonRuntimeExecutionResult {
  plan: MasonLiveExecutionPlan;
  status: MasonRuntimeExecutionStatus;
  results: MasonRuntimeOperationResult[];
  pullRequestUrl: string | null;
  previewUrl: string | null;
  summary: string;
  rollback?: MasonRollbackResult;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required Mason runtime parameter: ${key}`);
  }
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function requireStringArray(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Missing required Mason runtime parameter: ${key}`);
  }
  return value as string[];
}

function optionalStringArray(params: Record<string, unknown>, key: string): string[] | null {
  const value = params[key];
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

// Operation risk classification + gating is delegated to the Unified Autonomy
// Policy Engine (see @/lib/harmony/autonomy/mason-policy) so the Mason runtime
// shares one source of truth with every other agent.

function outputUrl(output: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!output) return null;
  for (const key of keys) {
    const value = output[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function outputString(output: Record<string, unknown> | undefined, keys: string[]): string | null {
  return outputUrl(output, keys);
}

function hasStringEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => typeof output[key] === "string" && String(output[key]).trim().length > 0);
}

function hasNumberEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => typeof output[key] === "number");
}

function hasBooleanEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => output[key] === true);
}

function hasRuntimeEvidence(operation: MasonLiveConnectorOperation, output: Record<string, unknown> | undefined): boolean {
  switch (operation.kind) {
    case "github_create_branch":
      return hasStringEvidence(output, ["branch", "name", "ref", "sha", "commitSha", "url", "htmlUrl"]);
    case "github_commit_file":
      return hasStringEvidence(output, ["sha", "commitSha", "contentSha", "commit", "url", "htmlUrl"]);
    case "github_open_pull_request":
      return hasStringEvidence(output, ["url", "htmlUrl", "pullRequestUrl"]) || hasNumberEvidence(output, ["id", "number", "pullRequestNumber"]);
    case "github_create_issue":
      return hasStringEvidence(output, ["url", "htmlUrl", "issueUrl"]) || hasNumberEvidence(output, ["id", "number", "issueNumber"]);
    case "vercel_check_preview":
      return hasStringEvidence(output, ["url", "previewUrl", "deploymentUrl", "status"]) || hasBooleanEvidence(output, ["ok", "ready"]);
    case "validation_request":
      return hasBooleanEvidence(output, ["requested"]);
    case "harmony_report_outcome":
      return hasBooleanEvidence(output, ["reported"]);
    case "activity_record":
      return hasBooleanEvidence(output, ["recorded"]);
    case "review_queue_update":
      return hasBooleanEvidence(output, ["queued"]);
    case "julius_memory_update":
      return hasBooleanEvidence(output, ["remembered"]);
    case "company_skill_update":
      return hasBooleanEvidence(output, ["learned"]);
    default:
      return false;
  }
}

async function executeOperation(operation: MasonLiveConnectorOperation, adapters: MasonRuntimeExecutorAdapters): Promise<MasonRuntimeOperationResult> {
  // Unified Autonomy Policy Engine gate — the single source of truth for whether
  // a Mason connector operation may run (replaces local mutation/merge heuristics).
  const gate = evaluateMasonOperationGate({
    kind: operation.kind,
    capabilityId: operation.capabilityId,
    approved: operation.approved,
  });
  if (!gate.allow) {
    return { operation, status: "blocked", summary: gate.reason };
  }

  try {
    const params = operation.params;
    let output: Record<string, unknown>;

    switch (operation.kind) {
      case "github_create_branch":
        output = await adapters.github.createBranch({ repository: requireString(params, "repo"), branch: requireString(params, "branch"), base: requireString(params, "base") });
        break;
      case "github_commit_file":
        output = await adapters.github.commitFile({ repository: requireString(params, "repo"), branch: requireString(params, "branch"), path: requireString(params, "path"), content: requireString(params, "content"), message: requireString(params, "message") });
        break;
      case "github_open_pull_request":
        output = await adapters.github.openPullRequest({ repository: requireString(params, "repo"), title: requireString(params, "title"), head: requireString(params, "head"), base: requireString(params, "base"), body: requireString(params, "body") });
        break;
      case "github_create_issue":
        output = await adapters.github.createIssue({ repository: requireString(params, "repo"), title: requireString(params, "title"), body: optionalString(params, "body"), labels: optionalStringArray(params, "labels") });
        break;
      case "validation_request":
        output = await adapters.harmony.requestValidation({ repository: requireString(params, "repo"), branch: requireString(params, "branch"), commands: requireStringArray(params, "commands") });
        break;
      case "vercel_check_preview":
        output = await adapters.vercel.inspectPreview({ repository: requireString(params, "repo"), branch: requireString(params, "branch"), objective: requireString(params, "objective"), previewUrl: optionalString(params, "previewUrl") });
        break;
      case "harmony_report_outcome":
        output = await adapters.harmony.reportOutcome(params);
        break;
      case "activity_record":
        output = await adapters.harmony.recordActivity(params);
        break;
      case "review_queue_update":
        output = await adapters.harmony.updateReviewQueue(params);
        break;
      case "julius_memory_update":
        output = await adapters.harmony.updateJuliusMemory(params);
        break;
      case "company_skill_update":
        output = await adapters.harmony.updateCompanySkills(params);
        break;
      default:
        output = { skipped: true };
        return { operation, status: "skipped", summary: `No runtime adapter is registered for ${operation.kind}.`, output };
    }

    if (!hasRuntimeEvidence(operation, output)) {
      return { operation, status: "failed", summary: `Mason runtime did not receive execution evidence for ${operation.kind}.`, output, error: "Missing verifiable runtime evidence from connector adapter." };
    }

    return { operation, status: "completed", summary: operation.summary, output };
  } catch (error) {
    return {
      operation,
      status: "failed",
      summary: `Mason runtime failed while executing ${operation.kind}.`,
      error: error instanceof Error ? error.message : "Unknown runtime execution error.",
    };
  }
}

export async function executeMasonRuntimePlan(input: MasonLiveExecutionPlanInput, adapters: MasonRuntimeExecutorAdapters): Promise<MasonRuntimeExecutionResult> {
  const plan = createMasonLiveExecutionPlan(input);
  let runtimeState: MasonRuntimeState =
    plan.status === "ready"
      ? "ready"
      : plan.status === "approval_required"
        ? "awaiting_founder_approval"
        : "blocked";

  if (plan.status !== "ready") {
    return { plan, status: "blocked", results: [], pullRequestUrl: null, previewUrl: null, summary: plan.blockedReason ?? "Mason runtime execution is blocked." };
  }

  const startTransition = transitionMasonRuntimeState(runtimeState, "executing");
  if (!startTransition.ok) {
    return {
      plan,
      status: "failed",
      results: [],
      pullRequestUrl: null,
      previewUrl: null,
      summary: startTransition.reason,
    };
  }
  runtimeState = "executing";

  const results: MasonRuntimeOperationResult[] = [];
  for (const operation of plan.operations) {
    const result = await executeOperation(operation, adapters);
    results.push(result);
    if (result.status === "blocked" || result.status === "failed" || result.status === "skipped") break;
  }

  const pullRequestUrl = outputUrl(results.find((result) => result.operation.kind === "github_open_pull_request")?.output, ["url", "htmlUrl", "pullRequestUrl"]);
  const previewUrl = outputUrl(results.find((result) => result.operation.kind === "vercel_check_preview")?.output, ["url", "previewUrl", "deploymentUrl"]);
  const branchOutput = results.find((result) => result.operation.kind === "github_create_branch")?.output;
  const commitResults = results.filter((result) => result.operation.kind === "github_commit_file" && result.status === "completed");
  const latestCommitOutput = commitResults.at(-1)?.output;
  const branch = outputString(branchOutput, ["branch", "name", "ref"]);
  const committedFiles = commitResults
    .map((result) => outputString(result.output, ["path", "file", "filename"]) ?? outputString(result.operation.params, ["path"]))
    .filter((item): item is string => Boolean(item));
  const commitSha = outputString(latestCommitOutput, ["commitSha", "sha", "commit", "contentSha"]);
  const commitUrl = outputString(latestCommitOutput, ["url", "htmlUrl", "commitUrl"]);
  const incomplete = results.find((result) => result.status === "blocked" || result.status === "failed" || result.status === "skipped");
  const evidence = [
    `Mason executed ${results.length} runtime operation(s).`,
    `Branch: ${branch ?? "not returned"}.`,
    committedFiles.length ? `Committed files: ${committedFiles.join(", ")}.` : "Committed files: none.",
    `Commit: ${commitSha ?? "not returned"}.`,
    `Commit URL: ${commitUrl ?? "not returned"}.`,
    `PR: ${pullRequestUrl ?? "not requested"}.`,
    `Preview: ${previewUrl ?? "not requested"}.`,
  ].join(" ");

  const baseResult: MasonRuntimeExecutionResult = {
    plan,
    status: incomplete ? incomplete.status === "blocked" ? "blocked" : "failed" : "completed",
    results,
    pullRequestUrl,
    previewUrl,
    summary: incomplete ? `${incomplete.summary} ${evidence}` : evidence,
  };

  if (baseResult.status === "completed") return baseResult;

  const trigger = classifyRollbackTrigger(baseResult, input.founderApproved === false);
  const rollbackPlan = createMasonRollbackPlan({
    request: {
      executionId: `${input.repository}:${plan.bridge.scopedPlan.branchName}`,
      repository: input.repository,
      branch: plan.bridge.scopedPlan.branchName,
      trigger,
      founderRequestedCancellation: input.founderApproved === false,
    },
    runtime: baseResult,
  });

  const rollback = await executeMasonRollbackPlan(rollbackPlan, {
    runtime: baseResult,
    adapters,
    operationScopeId: `${input.repository}:${plan.bridge.scopedPlan.branchName}`,
  });

  return {
    ...baseResult,
    rollback,
    summary: `${baseResult.summary} ${rollback.summary}`,
  };
}

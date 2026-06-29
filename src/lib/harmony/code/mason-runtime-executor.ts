import {
  createMasonLiveExecutionPlan,
  type MasonLiveConnectorOperation,
  type MasonLiveExecutionPlan,
  type MasonLiveExecutionPlanInput,
} from "@/lib/harmony/code/mason-live-execution";

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
  createBranch(input: {
    repository: string;
    branch: string;
    base: string;
  }): Promise<Record<string, unknown>>;
  commitFile(input: {
    repository: string;
    branch: string;
    path: string;
    content: string;
    message: string;
  }): Promise<Record<string, unknown>>;
  openPullRequest(input: {
    repository: string;
    title: string;
    head: string;
    base: string;
    body: string;
  }): Promise<Record<string, unknown>>;
  createIssue(input: {
    repository: string;
    title: string;
    body?: string | null;
    labels?: string[] | null;
  }): Promise<Record<string, unknown>>;
}

export interface MasonVercelRuntimeAdapter {
  inspectPreview(input: {
    repository: string;
    branch: string;
    objective: string;
    previewUrl?: string | null;
  }): Promise<Record<string, unknown>>;
}

export interface MasonHarmonyRuntimeAdapter {
  requestValidation(input: {
    repository: string;
    branch: string;
    commands: string[];
  }): Promise<Record<string, unknown>>;
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

function isMutationOperation(operation: MasonLiveConnectorOperation): boolean {
  return (
    operation.kind === "github_create_branch" ||
    operation.kind === "github_commit_file" ||
    operation.kind === "github_open_pull_request" ||
    operation.kind === "github_create_issue"
  );
}

function isMergeOrDestructive(operation: MasonLiveConnectorOperation): boolean {
  const text = `${operation.kind} ${operation.capabilityId}`.toLowerCase();
  return /merge|delete|destroy|drop|wipe|production_deploy|deploy_production/.test(text);
}

function outputUrl(output: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!output) return null;
  for (const key of keys) {
    const value = output[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function hasStringEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => {
    const value = output[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function hasNumberEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => typeof output[key] === "number");
}

function hasBooleanEvidence(output: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!output) return false;
  return keys.some((key) => output[key] === true);
}

function hasRuntimeEvidence(
  operation: MasonLiveConnectorOperation,
  output: Record<string, unknown> | undefined,
): boolean {
  switch (operation.kind) {
    case "github_create_branch":
      return hasStringEvidence(output, ["branch", "name", "ref", "sha", "commitSha", "url", "htmlUrl"]);
    case "github_commit_file":
      return hasStringEvidence(output, ["sha", "commitSha", "contentSha", "commit", "url", "htmlUrl"]);
    case "github_open_pull_request":
      return (
        hasStringEvidence(output, ["url", "htmlUrl", "pullRequestUrl"]) ||
        hasNumberEvidence(output, ["id", "number", "pullRequestNumber"])
      );
    case "github_create_issue":
      return (
        hasStringEvidence(output, ["url", "htmlUrl", "issueUrl"]) ||
        hasNumberEvidence(output, ["id", "number", "issueNumber"])
      );
    case "vercel_check_preview":
      return (
        hasStringEvidence(output, ["url", "previewUrl", "deploymentUrl", "status"]) ||
        hasBooleanEvidence(output, ["ok", "ready"])
      );
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

async function executeOperation(
  operation: MasonLiveConnectorOperation,
  adapters: MasonRuntimeExecutorAdapters,
): Promise<MasonRuntimeOperationResult> {
  if (!operation.approved && isMutationOperation(operation)) {
    return {
      operation,
      status: "blocked",
      summary: "Mutation operation blocked because it was not approved.",
    };
  }

  if (isMergeOrDestructive(operation)) {
    return {
      operation,
      status: "blocked",
      summary: "Mason runtime blocked merge or destructive operation.",
    };
  }

  try {
    const params = operation.params;
    let output: Record<string, unknown>;

    switch (operation.kind) {
      case "github_create_branch":
        output = await adapters.github.createBranch({
          repository: requireString(params, "repo"),
          branch: requireString(params, "branch"),
          base: requireString(params, "base"),
        });
        break;
      case "github_commit_file":
        output = await adapters.github.commitFile({
          repository: requireString(params, "repo"),
          branch: requireString(params, "branch"),
          path: requireString(params, "path"),
          content: requireString(params, "content"),
          message: requireString(params, "message"),
        });
        break;
      case "github_open_pull_request":
        output = await adapters.github.openPullRequest({
          repository: requireString(params, "repo"),
          title: requireString(params, "title"),
          head: requireString(params, "head"),
          base: requireString(params, "base"),
          body: requireString(params, "body"),
        });
        break;
      case "github_create_issue":
        output = await adapters.github.createIssue({
          repository: requireString(params, "repo"),
          title: requireString(params, "title"),
          body: optionalString(params, "body"),
          labels: optionalStringArray(params, "labels"),
        });
        break;
      case "validation_request":
        output = await adapters.harmony.requestValidation({
          repository: requireString(params, "repo"),
          branch: requireString(params, "branch"),
          commands: requireStringArray(params, "commands"),
        });
        break;
      case "vercel_check_preview":
        output = await adapters.vercel.inspectPreview({
          repository: requireString(params, "repo"),
          branch: requireString(params, "branch"),
          objective: requireString(params, "objective"),
          previewUrl: optionalString(params, "previewUrl"),
        });
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
        return {
          operation,
          status: "skipped",
          summary: `No runtime adapter is registered for ${operation.kind}.`,
          output,
        };
    }

    if (!hasRuntimeEvidence(operation, output)) {
      return {
        operation,
        status: "failed",
        summary: `Mason runtime did not receive execution evidence for ${operation.kind}.`,
        output,
        error: "Missing verifiable runtime evidence from connector adapter.",
      };
    }

    return {
      operation,
      status: "completed",
      summary: operation.summary,
      output,
    };
  } catch (error) {
    return {
      operation,
      status: "failed",
      summary: `Mason runtime failed while executing ${operation.kind}.",
      error: error instanceof Error ? error.message : "Unknown runtime execution error.",
    };
  }
}

export async function executeMasonRuntimePlan(
  input: MasonLiveExecutionPlanInput,
  adapters: MasonRuntimeExecutorAdapters,
): Promise<MasonRuntimeExecutionResult> {
  const plan = createMasonLiveExecutionPlan(input);

  if (plan.status !== "ready") {
    return {
      plan,
      status: "blocked",
      results: [],
      pullRequestUrl: null,
      previewUrl: null,
      summary: plan.blockedReason ?? "Mason runtime execution is blocked.",
    };
  }

  const results: MasonRuntimeOperationResult[] = [];
  for (const operation of plan.operations) {
    const result = await executeOperation(operation, adapters);
    results.push(result);
    if (result.status === "blocked" || result.status === "failed" || result.status === "skipped") break;
  }

  const pullRequestUrl = outputUrl(
    results.find((result) => result.operation.kind === "github_open_pull_request")?.output,
    ["url", "htmlUrl", "pullRequestUrl"],
  );
  const previewUrl = outputUrl(
    results.find((result) => result.operation.kind === "vercel_check_preview")?.output,
    ["url", "previewUrl", "deploymentUrl"],
  );
  const incomplete = results.find(
    (result) => result.status === "blocked" || result.status === "failed" || result.status === "skipped",
  );

  return {
    plan,
    status: incomplete ? incomplete.status === "blocked" ? "blocked" : "failed" : "completed",
    results,
    pullRequestUrl,
    previewUrl,
    summary: incomplete
      ? incomplete.summary
      : `Mason executed ${results.length} runtime operation(s). PR: ${pullRequestUrl ?? "not returned"}. Preview: ${previewUrl ?? "not returned"}.`,
  };
}

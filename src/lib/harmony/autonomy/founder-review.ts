import "server-only";

import type { ApprovalStatus, TaskPriority } from "@/types/database";

export type ApprovalSourceStore = "legacy" | "spine";

export interface FounderReviewModel {
  approvalId: string;
  sourceStore: ApprovalSourceStore;
  status: ApprovalStatus;
  companyId: string | null;
  requestingAgent: string;
  actionType: string;
  title: string;
  reasonRequired: string;
  objective?: string;
  proposedWork: string[];
  targetSystem?: string;
  repository?: string;
  branch?: string;
  filesAffected: string[];
  pullRequest?: string;
  deploymentTarget?: string;
  expectedImpact?: string;
  riskLevel: TaskPriority | "unknown";
  rollbackPlan?: string;
  validationEvidence?: string;
  createdAt?: string;
  expiresAt?: string | null;
  executionId?: string;
  correlationId?: string;
  contextAvailability: "available" | "legacy_unavailable" | "partial";
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function classifyReason(action: string, source: ApprovalSourceStore): string {
  const lower = action.toLowerCase();
  if (lower.includes("deploy")) return "Production deployment requires Founder approval.";
  if (lower.includes("merge")) return "Merge to protected branch requires Founder approval.";
  if (lower.includes("pull_request") || lower.includes("pull request")) {
    return "Repository mutation requires Founder review before execution.";
  }
  if (lower.includes("commit") || lower.includes("branch") || lower.includes("file")) {
    return "Engineering write operation requires governed approval.";
  }
  if (lower.includes("publish") || lower.includes("send_external")) {
    return "External communication/publishing requires Founder review.";
  }
  return source === "legacy"
    ? "Legacy approval requires Founder decision."
    : "Governed autonomy action requires Founder approval before execution.";
}

function inferTarget(params: Record<string, unknown>, required: Record<string, unknown>): string | undefined {
  return (
    asString(params.target) ??
    asString(params.environment) ??
    asString(required.target_state) ??
    asString(required.target) ??
    asString(params.connectorId)
  );
}

function collectProposedWork(
  action: string,
  params: Record<string, unknown>,
  required: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const objective = asString(params.objective) ?? asString(params.workItemTitle);
  if (objective) out.push(objective);

  const summary = asString(params.summary);
  if (summary) out.push(summary);

  const intent = asString(params.intent) ?? asString(params.requestedChange);
  if (intent) out.push(intent);

  const files = asStringArray(params.files ?? required.file_paths);
  if (files.length > 0) out.push(`Files in scope: ${files.join(", ")}`);

  if (out.length === 0) {
    out.push(`Action requested: ${action}`);
  }

  return out.slice(0, 8);
}

export function buildFounderReviewModel(input: {
  sourceStore: ApprovalSourceStore;
  status: ApprovalStatus;
  id: string;
  companyId: string | null;
  title?: string;
  summary?: string | null;
  type?: string;
  risk?: TaskPriority | null;
  createdAt?: string;
  expiresAt?: string | null;
  originalAgent?: string;
  originalAction?: string;
  originalParams?: Record<string, unknown>;
  requiredContext?: Record<string, unknown>;
}): FounderReviewModel {
  const params = asRecord(input.originalParams);
  const required = asRecord(input.requiredContext);

  const action = input.originalAction ?? input.type ?? "unknown_action";
  const agent = input.originalAgent ?? "harmony";

  const repository = asString(params.repository) ?? asString(required.repository);
  const branch = asString(params.branch) ?? asString(required.branch);
  const filesAffected = asStringArray(params.files ?? required.file_paths);
  const objective = asString(params.objective) ?? asString(params.workItemTitle) ?? asString(input.summary);
  const pullRequest = asString(params.pullRequestUrl) ?? asString(params.pr_url) ?? asString(params.pull_request);
  const executionId = asString(params.execution_id) ?? asString(required.execution_id);
  const correlationId = asString(params.correlation_id) ?? asString(required.correlation_id);
  const deploymentTarget = asString(params.environment) ?? asString(params.deploymentTarget);
  const expectedImpact = asString(params.expectedImpact) ?? asString(params.expected_impact);
  const rollbackPlan = asString(params.rollbackPlan) ?? asString(params.rollback_plan);
  const validationEvidence = asString(params.validationPlan) ?? asString(params.validation) ?? asString(required.validation);

  const hasStructured =
    Object.keys(params).length > 0 || Object.keys(required).length > 0 || filesAffected.length > 0 || Boolean(repository);

  return {
    approvalId: input.id,
    sourceStore: input.sourceStore,
    status: input.status,
    companyId: input.companyId,
    requestingAgent: agent,
    actionType: action,
    title: input.title ?? `${agent} · ${action}`,
    reasonRequired: classifyReason(action, input.sourceStore),
    objective,
    proposedWork: collectProposedWork(action, params, required),
    targetSystem: inferTarget(params, required),
    repository,
    branch,
    filesAffected,
    pullRequest,
    deploymentTarget,
    expectedImpact,
    riskLevel: input.risk ?? "unknown",
    rollbackPlan,
    validationEvidence,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt ?? null,
    executionId,
    correlationId,
    contextAvailability:
      input.sourceStore === "legacy"
        ? hasStructured
          ? "partial"
          : "legacy_unavailable"
        : hasStructured
          ? "available"
          : "partial",
  };
}

"use server";

import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";
import type { MasonLiveFileChange } from "@/lib/harmony/code/mason-live-execution";
import { retrieveMasonExecutionContext } from "@/lib/julius/mason-retrieval";
import { writeVerifiedJuliusOutcome } from "@/lib/julius/writeback";

const DEFAULT_AUTONOMY_TEST_CONTENT = "AIOS autonomous execution test successful.";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sanitizeBranchName(value: string | null | undefined): string | null {
  const branch = (value ?? "")
    .trim()
    .replace(/^refs\/heads\//i, "")
    .replace(/^['\"“”]+|['\"“”]+$/g, "")
    .replace(/[\s).,;:!?]+$/g, "");

  return branch.length > 0 ? branch : null;
}

function sanitizePath(value: string | null | undefined): string | null {
  const path = (value ?? "")
    .trim()
    .replace(/^['\"“”]+|['\"“”]+$/g, "")
    .replace(/[\s).,;:!?]+$/g, "")
    .replace(/^\.\//, "");

  return path.length > 0 ? path : null;
}

function inferRequestedBranch(message: string): string | null {
  const patterns = [
    /\bbranch\s+(?:called|named)\s+([^\s,.;!?]+)/i,
    /\bbranch\s*[:=]\s*([^\s,.;!?]+)/i,
    /\bcreate\s+(?:a\s+)?branch\s+([^\s,.;!?]+)/i,
    /\bin\s+branch\s+([^\s,.;!?]+)/i,
    /\bto\s+([A-Za-z0-9._\/-]+)\s+and\s+commit\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern)?.[1];
    const branch = sanitizeBranchName(match);
    if (branch) return branch;
  }

  return null;
}

function inferBaseBranch(message: string): string | null {
  const match = message.match(/\bfrom\s+([^\s,.;!?]+)/i)?.[1] ?? message.match(/\bbase\s*[:=]\s*([^\s,.;!?]+)/i)?.[1];
  return sanitizeBranchName(match);
}

function inferFilePath(message: string): string | null {
  const patterns = [
    /\b(?:add|create|write)\s+(?:a\s+)?(?:file\s+(?:named|called)\s+)?([A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)\b/i,
    /\bfile\s+(?:named|called)\s+([A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern)?.[1];
    const path = sanitizePath(match);
    if (path) return path;
  }

  return null;
}

function isPromptEcho(value: string, originalMessage: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedMessage = originalMessage.trim().toLowerCase();

  return (
    normalizedValue.length === 0 ||
    normalizedValue === normalizedMessage ||
    normalizedValue.startsWith("harmony, ask mason") ||
    normalizedValue.startsWith("ask mason") ||
    /\b(commit|pull request|open pr|without opening a pr|without opening a pull request)\b/.test(normalizedValue)
  );
}

function inferFileContent(message: string): string {
  const explicitContent =
    message.match(/\b(?:containing|with)\s+(?:the\s+text\s*)?["“]([^"”]+)["”]/i)?.[1] ??
    message.match(/\bcontent\s*[:=]\s*["“]([^"”]+)["”]/i)?.[1] ??
    message.match(/\bwrite\s+["“]([^"”]+)["”]/i)?.[1];

  const candidate = explicitContent?.trim();
  const safeContent = candidate && !isPromptEcho(candidate, message) ? candidate : DEFAULT_AUTONOMY_TEST_CONTENT;

  return `${safeContent}\n`;
}

function inferFileChanges(message: string): MasonLiveFileChange[] | undefined {
  const path = inferFilePath(message);
  if (!path) return undefined;

  return [
    {
      path,
      content: inferFileContent(message),
      message: `Mason add ${path}`,
    },
  ];
}

function removeKnownBranchName(message: string, branchName: string | null): string {
  if (!branchName) return message;
  return message.replaceAll(branchName, "");
}

function suppressesPullRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\bwithout\s+(opening|creating|making|raising)\s+(a\s+)?(pull request|pr)\b/.test(lower) ||
    /\b(no|not)\s+(pull request|pr)\b/.test(lower) ||
    /\bmust\s+not\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower) ||
    /\bdo\s+not\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower) ||
    /\bdon't\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower)
  );
}

function explicitlyRequestsPullRequest(message: string, branchName: string | null): boolean {
  if (suppressesPullRequest(message)) return false;

  const lower = removeKnownBranchName(message.toLowerCase(), branchName?.toLowerCase() ?? null);

  return (
    /\b(open|create|make|raise)\s+(a\s+)?(pull request|pr)\b/.test(lower) ||
    /\b(pull request|pr)\s+(called|named|titled|from|into|to|for)\b/.test(lower)
  );
}

function isBranchOnlyRequest(message: string, branchName: string | null): boolean {
  const lower = message.toLowerCase();
  return /\b(create|new)\s+(a\s+)?branch\b/.test(lower) && !explicitlyRequestsPullRequest(message, branchName);
}

function isCommitOnlyRequest(message: string, branchName: string | null): boolean {
  const lower = message.toLowerCase();
  return /\b(add|create|write|commit)\b/.test(lower) && /\b(file|commit|\.md|\.ts|\.tsx|\.json)\b/.test(lower) && !explicitlyRequestsPullRequest(message, branchName);
}

export async function handleMasonEngineeringMessage(input: {
  userId: string;
  message: string;
  founderApproved?: boolean;
  companyId?: string | null;
  repository?: string | null;
}) {
  const companyId = input.companyId ?? "aios";
  const slug = slugify(input.message);
  const requestedBranch = inferRequestedBranch(input.message);
  const fileChanges = inferFileChanges(input.message);
  const branchOnly = isBranchOnlyRequest(input.message, requestedBranch);
  const commitOnly = isCommitOnlyRequest(input.message, requestedBranch);
  const prRequested = explicitlyRequestsPullRequest(input.message, requestedBranch);
  const executionId = `mason-exec-${Date.now().toString(36)}`;

  const retrieval = input.founderApproved !== true
    ? {
        status: "degraded" as const,
        context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: executionId,
          correlation_id: executionId,
          causation_id: null,
          worker_id: "mason" as const,
          source_type: "mason_runtime" as const,
          source_id: `mason-action:${executionId}`,
          timestamp: new Date().toISOString(),
          trace: {
            path: "workforce.mason-action",
            query: input.message.slice(0, 240),
          },
        },
        entries: [],
        degraded: true,
        error: "founder_approval_required_before_retrieval",
      }
    : await retrieveMasonExecutionContext({
    context: {
      company_id: companyId,
      user_id: input.userId,
      actor_id: "mason",
      execution_id: executionId,
      correlation_id: executionId,
      causation_id: null,
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: `mason-action:${executionId}`,
      approval_id: null,
      trace: {
        path: "workforce.mason-action",
        query: input.message.slice(0, 240),
      },
    },
    engineeringQuery: input.message,
  });

  if (retrieval.status === "failed") {
    return {
      status: "blocked",
      summary: `Julius retrieval failed before Mason planning: ${retrieval.error}`,
      pullRequestUrl: null,
      previewUrl: null,
      branch: null,
      branchCreated: false,
      commitCreated: false,
      pullRequestCreated: false,
      issueCreated: false,
      issueNumber: null,
      issueUrl: null,
      requestedBaseBranch: null,
      requestedBranchName: null,
      explicitBranchRequest: false,
      explicitPullRequestRequest: false,
      shouldOpenPullRequest: false,
      diagnostics: {
        retrievalStatus: retrieval.status,
        retrievalEntries: retrieval.entries.length,
        retrievalError: retrieval.error,
        retrievalExecutionId: retrieval.context.execution_id,
        retrievalCorrelationId: retrieval.context.correlation_id,
      },
    };
  }

  const result = await runMasonProductionRuntime({
    companyId,
    userId: input.userId,
    objective: input.message,
    repository:
      input.repository ??
      process.env.HARMONY_DEFAULT_GITHUB_REPO ??
      process.env.GITHUB_DEFAULT_REPO ??
      "AIOS-HQ/aios-platform",
    requesterRole: "founder",
    founderApproved: input.founderApproved === true,
    baseBranch: inferBaseBranch(input.message),
    branchName: requestedBranch ?? `mason/${slug || "engineering-task"}`,
    fileChanges,
    openPullRequest: prRequested ? true : branchOnly || commitOnly || suppressesPullRequest(input.message) ? false : undefined,
  });

  const category = result.status === "completed"
    ? "engineering_completion"
    : result.summary.toLowerCase().includes("rollback")
      ? "rollback_lesson"
      : result.summary.toLowerCase().includes("recover")
        ? "recovery_lesson"
        : "failure_lesson";

  const verification = result.status === "completed" || result.status === "failed"
    ? "verified"
    : "unverified";

  const juliusWriteback = await writeVerifiedJuliusOutcome({
      context: {
        company_id: companyId,
      user_id: input.userId,
      actor_id: "mason",
      execution_id: executionId,
      correlation_id: retrieval.context.correlation_id,
      causation_id: retrieval.context.causation_id ?? null,
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: `mason-runtime:${executionId}`,
      approval_id: null,
      trace: {
        retrievalStatus: retrieval.status,
        runtimeStatus: result.status,
      },
    },
    category,
    verification,
    policy: {
      approved: input.founderApproved === true,
      requiresApproval: result.status !== "completed",
      approvalId: null,
    },
    outcome: {
      status: result.status,
      summary: result.summary,
      details: [result.pullRequestUrl, result.previewUrl].filter(Boolean).join(" | ") || null,
    },
    source: {
      source_type: "mason_runtime",
      source_id: `mason-runtime:${executionId}`,
    },
    trace: {
      retrievalStatus: retrieval.status,
      retrievalEntries: retrieval.entries.length,
    },
  });

  return {
    juliusWriteback,
    ...result,
    summary: `${result.summary} (Julius retrieval: ${retrieval.status}${retrieval.status === "found" ? `, entries=${retrieval.entries.length}` : ""})`,
    diagnostics: {
      retrievalStatus: retrieval.status,
      retrievalEntries: retrieval.entries.length,
      retrievalExecutionId: retrieval.context.execution_id,
      retrievalCorrelationId: retrieval.context.correlation_id,
    },
  };
}

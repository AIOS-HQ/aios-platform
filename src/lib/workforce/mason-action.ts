"use server";

import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";

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

function inferRequestedBranch(message: string): string | null {
  const patterns = [
    /\bbranch\s+(?:called|named)\s+([^\s,.;!?]+)/i,
    /\bbranch\s*[:=]\s*([^\s,.;!?]+)/i,
    /\bcreate\s+(?:a\s+)?branch\s+([^\s,.;!?]+)/i,
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

function removeKnownBranchName(message: string, branchName: string | null): string {
  if (!branchName) return message;
  return message.replaceAll(branchName, "");
}

function explicitlyRequestsPullRequest(message: string, branchName: string | null): boolean {
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

export async function handleMasonEngineeringMessage(input: {
  userId: string;
  message: string;
  founderApproved?: boolean;
  companyId?: string | null;
  repository?: string | null;
}) {
  const slug = slugify(input.message);
  const requestedBranch = inferRequestedBranch(input.message);
  const branchOnly = isBranchOnlyRequest(input.message, requestedBranch);

  return runMasonProductionRuntime({
    companyId: input.companyId ?? null,
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
    openPullRequest: branchOnly ? false : undefined,
  });
}

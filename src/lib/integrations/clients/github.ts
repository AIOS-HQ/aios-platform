import "server-only";

import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import type {
  GitHubVercelEvidence,
  VercelDeploymentEnvironment,
} from "@/lib/integrations/vercel/deployment-status";

/**
 * GitHub read client (PR 6c).
 *
 * Read-only GitHub REST access using the owner's stored token (fetched +
 * refreshed via getValidAccessToken). Every function degrades gracefully: a
 * missing token or API error returns { ok:false } rather than throwing. Writes
 * are NOT implemented here — they remain governed by the policy engine and land
 * in the GitHub write-client PR.
 */

const API = "https://api.github.com";

export interface GitHubReadResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

async function gh(userId: string, path: string): Promise<unknown | null> {
  const token = await getValidAccessToken(userId, "github", "github");
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (e) {
    console.error("[github] api", e);
    return null;
  }
}

/** Dispatch a GitHub read capability. `params.repo` is "owner/name" where needed. */
export async function runGithubRead(
  userId: string,
  capabilityId: string,
  params: Record<string, unknown>,
): Promise<GitHubReadResult> {
  const repo = typeof params.repo === "string" ? params.repo.trim() : "";
  const repoEnc = repo
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");

  switch (capabilityId) {
    case "list_repos": {
      const j = (await gh(userId, "/user/repos?per_page=30&sort=updated")) as
        | { full_name?: string }[]
        | null;
      if (!Array.isArray(j)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: { count: j.length, repos: j.map((r) => r.full_name).filter(Boolean) },
      };
    }
    case "list_issues": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/issues?per_page=30&state=open`)) as
        | { number?: number; title?: string; pull_request?: unknown }[]
        | null;
      if (!Array.isArray(j)) return { ok: false, error: "unavailable" };
      const issues = j
        .filter((i) => !i.pull_request)
        .map((i) => ({ number: i.number, title: i.title }));
      return { ok: true, data: { count: issues.length, issues } };
    }
    case "list_pull_requests": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/pulls?per_page=30&state=open`)) as
        | { number?: number; title?: string }[]
        | null;
      if (!Array.isArray(j)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: {
          count: j.length,
          pulls: j.map((p) => ({ number: p.number, title: p.title })),
        },
      };
    }
    case "list_branches": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/branches?per_page=50`)) as
        | { name?: string }[]
        | null;
      if (!Array.isArray(j)) return { ok: false, error: "unavailable" };
      return { ok: true, data: { count: j.length, branches: j.map((br) => br.name).filter(Boolean) } };
    }
    case "list_workflows": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/actions/workflows`)) as
        | { workflows?: { name?: string; state?: string }[] }
        | null;
      if (!j || !Array.isArray(j.workflows)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: {
          count: j.workflows.length,
          workflows: j.workflows.map((w) => ({ name: w.name, state: w.state })),
        },
      };
    }
    case "review_build_result": {
      if (!repo) return { ok: false, error: "repo_required" };
      const prNumber = typeof params.prNumber === "number" ? params.prNumber : Number(params.prNumber);
      if (!Number.isFinite(prNumber) || prNumber <= 0) {
        return { ok: false, error: "pr_number_required" };
      }
      const branch = typeof params.branch === "string" ? params.branch.trim() : "";
      if (!branch) return { ok: false, error: "branch_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/actions/runs?per_page=5`)) as
        | {
            workflow_runs?: {
              name?: string;
              status?: string;
              conclusion?: string;
              head_sha?: string;
              head_branch?: string;
              pull_requests?: { number?: number }[];
            }[];
          }
        | null;
      if (!j || !Array.isArray(j.workflow_runs)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: {
          runs: j.workflow_runs
            .filter((r) => r.head_branch === branch && Array.isArray(r.pull_requests) && r.pull_requests.some((p) => p.number === prNumber))
            .map((r) => ({
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            head_sha: r.head_sha,
            })),
        },
      };
    }
    case "monitor_deployment": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/actions/runs?per_page=5`)) as
        | { workflow_runs?: { name?: string; status?: string; conclusion?: string; head_sha?: string }[] }
        | null;
      if (!j || !Array.isArray(j.workflow_runs)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: {
          runs: j.workflow_runs.map((r) => ({
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            head_sha: r.head_sha,
          })),
        },
      };
    }
    default:
      return { ok: false, error: "unsupported_read" };
  }
}

interface GitHubCommitStatusPayload {
  statuses?: Array<{
    context?: string;
    state?: string;
    target_url?: string;
    created_at?: string;
    updated_at?: string;
  }>;
}

interface GitHubDeploymentPayload {
  id?: number;
  sha?: string;
  environment?: string;
  created_at?: string;
  updated_at?: string;
}

interface GitHubDeploymentStatusPayload {
  state?: string;
  environment_url?: string;
  created_at?: string;
  updated_at?: string;
}

function githubDeploymentState(value: string | null | undefined): GitHubVercelEvidence["status"] {
  const state = value?.toLowerCase();
  if (state === "success") return "success";
  if (state === "pending" || state === "queued" || state === "in_progress") return "pending";
  if (state === "failure" || state === "error" || state === "inactive") return "failure";
  return "unavailable";
}

/**
 * Read-only fallback evidence emitted by the installed GitHub/Vercel
 * integration. This is deliberately labeled GitHub evidence and never
 * represented as direct Vercel API proof.
 */
export async function readGitHubVercelDeploymentEvidence(
  userId: string,
  input: {
    repository: string;
    gitSha: string;
    environment: VercelDeploymentEnvironment;
  },
): Promise<GitHubVercelEvidence | null> {
  const repo = input.repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const sha = encodeURIComponent(input.gitSha);
  const [combined, deploymentList] = await Promise.all([
    gh(userId, `/repos/${repo}/commits/${sha}/status`) as Promise<GitHubCommitStatusPayload | null>,
    gh(userId, `/repos/${repo}/deployments?sha=${sha}&per_page=30`) as Promise<GitHubDeploymentPayload[] | null>,
  ]);

  const vercelStatus = combined?.statuses?.find((status) =>
    status.context?.toLowerCase().includes("vercel"),
  );
  const requestedEnvironment = input.environment.toLowerCase();
  const deployment = Array.isArray(deploymentList)
    ? deploymentList.find((item) => {
        const environment = item.environment?.toLowerCase() ?? "";
        return item.sha === input.gitSha &&
          (requestedEnvironment === "production"
            ? environment === "production"
            : environment !== "production");
      })
    : undefined;

  // A generic successful Vercel commit status may support preview readiness,
  // but it cannot prove a production deployment or alias without an explicit
  // GitHub deployment record for the requested SHA/environment.
  if (input.environment === "production" && !deployment) return null;

  const deploymentStatuses = deployment?.id
    ? ((await gh(userId, `/repos/${repo}/deployments/${deployment.id}/statuses?per_page=10`)) as
        | GitHubDeploymentStatusPayload[]
        | null)
    : null;
  const deploymentStatus = Array.isArray(deploymentStatuses) ? deploymentStatuses[0] : undefined;
  const deploymentState = githubDeploymentState(deploymentStatus?.state);
  const commitState = githubDeploymentState(vercelStatus?.state);
  const status =
    deploymentState !== "unavailable"
      ? deploymentState
      : commitState;
  if (status === "unavailable") return null;

  return {
    status,
    deploymentId: deployment?.id ?? null,
    deploymentUrl: deploymentStatus?.environment_url ?? vercelStatus?.target_url ?? null,
    environment: deployment?.environment ?? input.environment,
    gitSha: deployment?.sha ?? input.gitSha,
    createdAt: deployment?.created_at ?? vercelStatus?.created_at ?? null,
    completedAt: deploymentStatus?.updated_at ?? deployment?.updated_at ?? vercelStatus?.updated_at ?? null,
    sources: [
      ...(vercelStatus ? ["github_vercel_status"] : []),
      ...(deployment ? ["github_vercel_deployment"] : []),
      ...(deploymentStatus ? ["github_vercel_deployment_status"] : []),
    ],
  };
}

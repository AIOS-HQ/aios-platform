import "server-only";

import { getValidAccessToken } from "@/lib/integrations/token-refresh";

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
    case "review_build_result":
    case "monitor_deployment": {
      if (!repo) return { ok: false, error: "repo_required" };
      const j = (await gh(userId, `/repos/${repoEnc}/actions/runs?per_page=5`)) as
        | { workflow_runs?: { name?: string; status?: string; conclusion?: string }[] }
        | null;
      if (!j || !Array.isArray(j.workflow_runs)) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        data: {
          runs: j.workflow_runs.map((r) => ({
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
          })),
        },
      };
    }
    default:
      return { ok: false, error: "unsupported_read" };
  }
}

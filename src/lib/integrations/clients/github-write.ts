import "server-only";

import { getValidAccessToken } from "@/lib/integrations/token-refresh";

const API = "https://api.github.com";

export interface GitHubWriteResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function encodeRepo(repo: string): string {
  return repo.split("/").map(encodeURIComponent).join("/");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function gh(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  const token = await getValidAccessToken(userId, "github", "github");
  if (!token) return { ok: false, status: 401, json: null };

  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    });

    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    console.error("[github-write] api", e);
    return { ok: false, status: 0, json: null };
  }
}

function apiError(
  status: number,
  json: unknown,
  fallback: string,
): GitHubWriteResult {
  const message =
    json && typeof json === "object" && "message" in json
      ? String((json as { message?: unknown }).message)
      : fallback;

  return { ok: false, error: `${message}:${status}` };
}

async function getDefaultBranch(userId: string, repo: string): Promise<string | null> {
  const res = await gh(userId, `/repos/${encodeRepo(repo)}`);
  if (!res.ok || !res.json || typeof res.json !== "object") return null;

  const branch = (res.json as { default_branch?: unknown }).default_branch;
  return typeof branch === "string" ? branch : null;
}

async function getBranchSha(
  userId: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  const res = await gh(
    userId,
    `/repos/${encodeRepo(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
  );

  if (!res.ok || !res.json || typeof res.json !== "object") return null;

  const object = (res.json as { object?: { sha?: unknown } }).object;
  return typeof object?.sha === "string" ? object.sha : null;
}

export async function runGithubWrite(
  userId: string,
  capabilityId: string,
  params: Record<string, unknown>,
): Promise<GitHubWriteResult> {
  const repo = typeof params.repo === "string" ? params.repo.trim() : "";
  if (!repo) return { ok: false, error: "repo_required" };

  const repoEnc = encodeRepo(repo);

  switch (capabilityId) {
    case "create_issue": {
      const title = typeof params.title === "string" ? params.title.trim() : "";
      const body = typeof params.body === "string" ? params.body : undefined;
      const labels = Array.isArray(params.labels)
        ? params.labels.filter((x): x is string => typeof x === "string")
        : undefined;

      if (!title) return { ok: false, error: "title_required" };

      const res = await gh(userId, `/repos/${repoEnc}/issues`, {
        method: "POST",
        body: JSON.stringify({ title, body, labels }),
      });

      if (!res.ok) return apiError(res.status, res.json, "create_issue_failed");

      const issue = res.json as {
        number?: number;
        html_url?: string;
        title?: string;
      };

      return {
        ok: true,
        data: {
          number: issue.number,
          url: issue.html_url,
          title: issue.title,
        },
      };
    }

    case "create_branch": {
      const branch = typeof params.branch === "string" ? params.branch.trim() : "";
      if (!branch) return { ok: false, error: "branch_required" };

      const base =
        typeof params.base === "string" && params.base.trim()
          ? params.base.trim()
          : await getDefaultBranch(userId, repo);

      if (!base) return { ok: false, error: "base_branch_unavailable" };

      const sha = await getBranchSha(userId, repo, base);
      if (!sha) return { ok: false, error: "base_sha_unavailable" };

      const res = await gh(userId, `/repos/${repoEnc}/git/refs`, {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha,
        }),
      });

      if (!res.ok && res.status !== 422) {
        return apiError(res.status, res.json, "create_branch_failed");
      }

      return {
        ok: true,
        data: {
          branch,
          base,
          alreadyExists: res.status === 422,
        },
      };
    }

    case "open_pull_request": {
      const title = typeof params.title === "string" ? params.title.trim() : "";
      const head = typeof params.head === "string" ? params.head.trim() : "";
      const body = typeof params.body === "string" ? params.body : undefined;

      const base =
        typeof params.base === "string" && params.base.trim()
          ? params.base.trim()
          : await getDefaultBranch(userId, repo);

      if (!title) return { ok: false, error: "title_required" };
      if (!head) return { ok: false, error: "head_required" };
      if (!base) return { ok: false, error: "base_branch_unavailable" };

      const res = await gh(userId, `/repos/${repoEnc}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title,
          head,
          base,
          body,
          maintainer_can_modify: true,
        }),
      });

      if (!res.ok) {
        return apiError(res.status, res.json, "open_pull_request_failed");
      }

      const pr = res.json as {
        number?: number;
        html_url?: string;
        title?: string;
      };

      return {
        ok: true,
        data: {
          number: pr.number,
          url: pr.html_url,
          title: pr.title,
        },
      };
    }

    case "commit_file_to_branch": {
      const branch = typeof params.branch === "string" ? params.branch.trim() : "";
      const path = typeof params.path === "string" ? params.path.trim() : "";
      const content = typeof params.content === "string" ? params.content : "";
      const message =
        typeof params.message === "string" && params.message.trim()
          ? params.message.trim()
          : `Harmony update ${path}`;

      if (!branch) return { ok: false, error: "branch_required" };
      if (!path) return { ok: false, error: "path_required" };

      const existing = await gh(
        userId,
        `/repos/${repoEnc}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      );

      const sha =
        existing.ok && existing.json && typeof existing.json === "object"
          ? (existing.json as { sha?: unknown }).sha
          : undefined;

      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      };

      if (typeof sha === "string") body.sha = sha;

      const res = await gh(userId, `/repos/${repoEnc}/contents/${encodePath(path)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      if (!res.ok) return apiError(res.status, res.json, "commit_file_failed");

      const commit = res.json as {
        commit?: { sha?: string; html_url?: string };
      };

      return {
        ok: true,
        data: {
          path,
          branch,
          commitSha: commit.commit?.sha,
          url: commit.commit?.html_url,
        },
      };
    }

    case "merge_pull_request":
    case "delete_repository":
      return {
        ok: false,
        error: "capability_requires_approval_or_is_unsupported_here",
      };

    default:
      return { ok: false, error: "unsupported_write" };
  }
}

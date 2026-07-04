import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { githubFetch } from "./client";

/**
 * GitHub capability implementation — the REFERENCE PATTERN for every provider.
 *
 * Each capability is registered as a thin handler on the Universal Capability
 * Runtime. The runtime owns everything cross-cutting — capability loading,
 * discovery, permission (risk-class governance), connection + token, retry,
 * telemetry, diagnostics, recovery, auditing — so a provider only declares HOW
 * to call its API. To add another provider: mirror this file.
 *
 * Governance is inherited: reads are routine (autonomous); create_* are routine
 * writes; merge_pull_request is approval-gated; delete_repository is destructive.
 * The runtime enforces the gate BEFORE these handlers run.
 */

interface RepoRef {
  owner: string;
  repo: string;
}
interface CreateIssueInput extends RepoRef {
  title: string;
  body?: string;
}
interface CreateBranchInput extends RepoRef {
  branch: string;
  fromSha: string;
}
interface OpenPrInput extends RepoRef {
  title: string;
  head: string;
  base: string;
  body?: string;
}
interface CommitFileInput extends RepoRef {
  path: string;
  message: string;
  content: string;
  branch: string;
  sha?: string;
}
interface MergePrInput extends RepoRef {
  pullNumber: number;
  mergeMethod?: "merge" | "squash" | "rebase";
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing GitHub access token");
  return token;
}

let registered = false;

/** Register the full GitHub capability set on the runtime. Idempotent. */
export function registerGitHubCapabilities(): void {
  if (registered) return;
  registered = true;

  // ── Reads (routine → autonomous) ─────────────────────────────────────────
  registerCapabilityHandler("github", "list_repos", async ({ accessToken }) =>
    githubFetch(requireToken(accessToken), { path: "/user/repos?per_page=100&sort=updated" }),
  );
  registerCapabilityHandler<RepoRef, unknown>("github", "list_issues", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      path: `/repos/${input.owner}/${input.repo}/issues?state=open&per_page=100`,
    }),
  );
  registerCapabilityHandler<RepoRef, unknown>("github", "list_pull_requests", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      path: `/repos/${input.owner}/${input.repo}/pulls?state=open&per_page=100`,
    }),
  );
  registerCapabilityHandler<RepoRef, unknown>("github", "list_branches", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      path: `/repos/${input.owner}/${input.repo}/branches?per_page=100`,
    }),
  );

  // ── Routine writes ───────────────────────────────────────────────────────
  registerCapabilityHandler<CreateIssueInput, unknown>("github", "create_issue", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/issues`,
      body: { title: input.title, body: input.body },
    }),
  );
  registerCapabilityHandler<CreateBranchInput, unknown>("github", "create_branch", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/git/refs`,
      body: { ref: `refs/heads/${input.branch}`, sha: input.fromSha },
    }),
  );
  registerCapabilityHandler<OpenPrInput, unknown>("github", "open_pull_request", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/pulls`,
      body: { title: input.title, head: input.head, base: input.base, body: input.body },
    }),
  );
  registerCapabilityHandler<CommitFileInput, unknown>("github", "commit_file_to_branch", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "PUT",
      path: `/repos/${input.owner}/${input.repo}/contents/${input.path}`,
      body: {
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: input.sha,
      },
    }),
  );

  // ── Approval-gated (runtime enforces authorize before this runs) ─────────
  registerCapabilityHandler<MergePrInput, unknown>("github", "merge_pull_request", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "PUT",
      path: `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/merge`,
      body: { merge_method: input.mergeMethod ?? "squash" },
    }),
  );

  // ── Destructive (runtime enforces destructive_approval before this runs) ──
  registerCapabilityHandler<RepoRef, unknown>("github", "delete_repository", async ({ accessToken, input }) =>
    githubFetch(requireToken(accessToken), {
      method: "DELETE",
      path: `/repos/${input.owner}/${input.repo}`,
    }),
  );
}

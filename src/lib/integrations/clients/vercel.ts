import "server-only";

const API = "https://api.vercel.com";

export interface VercelRunResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function token(): string | null {
  return process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || null;
}

async function vercel(path: string): Promise<{ ok: boolean; status: number; json: unknown | null }> {
  const accessToken = token();
  if (!accessToken) return { ok: false, status: 401, json: null };

  try {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (error) {
    console.error("[vercel] api", error);
    return { ok: false, status: 0, json: null };
  }
}

function error(status: number, json: unknown, fallback: string): VercelRunResult {
  const message =
    json && typeof json === "object" && "error" in json
      ? JSON.stringify((json as { error?: unknown }).error)
      : fallback;
  return { ok: false, error: `${message}:${status}` };
}

function projectFromParams(params: Record<string, unknown>): string | null {
  const project = typeof params.project === "string" ? params.project.trim() : "";
  if (project) return project;
  const repo = typeof params.repo === "string" ? params.repo.trim() : "";
  return repo ? repo.split("/").at(-1) ?? null : null;
}

export async function runVercelRead(
  _userId: string,
  capabilityId: string,
  params: Record<string, unknown>,
): Promise<VercelRunResult> {
  const project = projectFromParams(params);
  const branch = typeof params.branch === "string" ? params.branch.trim() : "";

  switch (capabilityId) {
    case "deployment_status":
    case "build_status":
    case "list_deployments": {
      const query = new URLSearchParams();
      if (project) query.set("projectId", project);
      if (branch) query.set("meta-githubCommitRef", branch);
      query.set("limit", "5");

      const res = await vercel(`/v6/deployments?${query.toString()}`);
      if (!res.ok) return error(res.status, res.json, "vercel_deployments_failed");
      return { ok: true, data: { deployments: res.json, project, branch } };
    }

    case "production_url_verification":
    case "env_var_presence":
      return {
        ok: false,
        error: "vercel_capability_requires_project_specific_followup",
      };

    default:
      return { ok: false, error: "unsupported_vercel_read" };
  }
}

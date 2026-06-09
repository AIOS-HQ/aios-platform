import "server-only";

import { getConnectionSecret } from "@/lib/integrations/secrets";
import type {
  DiagnosticItem,
  DiagnosticsResult,
} from "@/lib/integrations/clients/supabase-diagnostics";

/**
 * Read-only Vercel diagnostics (Phase 6b).
 *
 * Uses the user's Vercel access token (+ optional project id) to read deployment
 * and project state via the Vercel REST API. No writes. Environment-variable
 * checks return NAMES/counts only — never values. Degrades gracefully on error.
 */

const API = "https://api.vercel.com";

async function apiGet(token: string, path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (e) {
    console.error("[diagnostics] vercel api", e);
    return null;
  }
}

export async function runVercelDiagnostics(userId: string): Promise<DiagnosticsResult> {
  const secret = await getConnectionSecret(userId, "vercel");
  if (!secret) return { connected: false, items: [] };
  const token = secret.accessToken;
  const project = secret.externalAccount;
  const items: DiagnosticItem[] = [];

  const q = project
    ? `?projectId=${encodeURIComponent(project)}&limit=1&target=production`
    : "?limit=1&target=production";
  const deployments = (await apiGet(token, `/v6/deployments${q}`)) as {
    deployments?: { state?: string; readyState?: string; url?: string }[];
  } | null;
  const dep = deployments?.deployments?.[0];
  const state = dep?.state ?? dep?.readyState ?? "unknown";

  items.push({
    id: "deployment_status",
    ok: Boolean(dep),
    detail: dep ? state : "no deployments found",
  });
  items.push({
    id: "production_url_verification",
    ok: Boolean(dep?.url),
    detail: dep?.url ? `https://${dep.url}` : "no production URL",
  });
  items.push({
    id: "build_status",
    ok: state === "READY",
    detail: state === "READY" ? "latest build READY" : `state: ${state}`,
  });

  if (project) {
    const env = (await apiGet(
      token,
      `/v9/projects/${encodeURIComponent(project)}/env`,
    )) as { envs?: { key?: string }[] } | null;
    const count = (env?.envs ?? []).filter((e) => Boolean(e.key)).length;
    items.push({
      id: "env_var_presence",
      ok: count > 0,
      detail: count > 0 ? `${count} environment variables set` : "none found or no access",
    });
  } else {
    items.push({ id: "env_var_presence", ok: false, detail: "project id required" });
  }

  return { connected: true, items };
}

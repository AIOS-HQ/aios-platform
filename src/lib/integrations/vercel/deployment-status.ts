import "server-only";

import type { RuntimeDeploymentIdentity } from "@/lib/deployment/identity";

export type VercelDeploymentHealth =
  | "healthy"
  | "pending"
  | "failed"
  | "unavailable"
  | "misconfigured";

export type VercelEvidenceTier =
  | "direct_vercel_api"
  | "github_vercel_deployment_status"
  | "runtime_deployment_identity"
  | "unavailable";

export type VercelDeploymentEnvironment = "preview" | "production";

export interface VercelDeploymentStatusResult {
  provider: "vercel";
  status: VercelDeploymentHealth;
  evidenceTier: VercelEvidenceTier;
  evidenceSources: string[];
  teamId: string | null;
  projectId: string | null;
  environment: VercelDeploymentEnvironment;
  deploymentId: string | null;
  deploymentUrl: string | null;
  canonicalDomain: string | null;
  gitSha: string | null;
  requestedGitSha: string | null;
  gitShaMatches: boolean | null;
  deploymentState: string | null;
  readyState: string | null;
  createdAt: string | null;
  completedAt: string | null;
  requiredChecksPassed: boolean | null;
  buildEventsAvailable: boolean;
  runtimeLogsAvailable: boolean;
  runtimeLogLimitations: string | null;
  errorCode: string | null;
  safeMessage: string;
  observedAt: string;
}

export interface VercelDirectConfig {
  token: string;
  teamId: string;
  projectId: string;
  canonicalDomain?: string | null;
}

export interface VercelDirectStatusInput {
  environment: VercelDeploymentEnvironment;
  requestedGitSha?: string | null;
  branch?: string | null;
  deploymentId?: string | null;
  deploymentUrl?: string | null;
  expectedProject?: string | null;
  expectedTeam?: string | null;
  canonicalDomain?: string | null;
  config?: VercelDirectConfig | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface GitHubVercelEvidence {
  status: "success" | "pending" | "failure" | "error" | "unavailable";
  deploymentId?: string | number | null;
  deploymentUrl?: string | null;
  environment?: string | null;
  gitSha?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  sources?: string[];
}

export interface VercelReadinessResult {
  ready: boolean;
  code: string;
}

interface ApiResult {
  ok: boolean;
  status: number;
  data: unknown;
  errorCode: string | null;
}

interface VercelProjectPayload {
  id?: string;
  name?: string;
  accountId?: string;
  targets?: {
    production?: {
      id?: string;
      alias?: string[];
    };
  };
}

interface VercelDeploymentPayload {
  uid?: string;
  id?: string;
  name?: string;
  url?: string;
  alias?: string[];
  state?: string;
  readyState?: string;
  target?: string | null;
  created?: number | string;
  createdAt?: number | string;
  buildingAt?: number | string;
  ready?: number | string;
  readyAt?: number | string;
  meta?: Record<string, unknown>;
  gitSource?: { sha?: string; ref?: string };
}

const API = "https://api.vercel.com";
const RUNTIME_LOG_LIMITATION =
  "Deployment/build events do not prove runtime-log access; runtime logs require a separately supported Vercel log-drain or runtime-log API path.";

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function domain(value: string | null | undefined): string | null {
  const normalized = clean(value);
  if (!normalized) return null;
  try {
    return new URL(normalized.includes("://") ? normalized : `https://${normalized}`).hostname.toLowerCase();
  } catch {
    return normalized.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? null;
  }
}

function url(value: string | null | undefined): string | null {
  const normalized = clean(value);
  if (!normalized) return null;
  return normalized.includes("://") ? normalized : `https://${normalized}`;
}

function timestamp(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusResult(
  environment: VercelDeploymentEnvironment,
  now: Date,
  overrides: Partial<VercelDeploymentStatusResult>,
): VercelDeploymentStatusResult {
  return {
    provider: "vercel",
    status: "unavailable",
    evidenceTier: "unavailable",
    evidenceSources: [],
    teamId: null,
    projectId: null,
    environment,
    deploymentId: null,
    deploymentUrl: null,
    canonicalDomain: null,
    gitSha: null,
    requestedGitSha: null,
    gitShaMatches: null,
    deploymentState: null,
    readyState: null,
    createdAt: null,
    completedAt: null,
    requiredChecksPassed: null,
    buildEventsAvailable: false,
    runtimeLogsAvailable: false,
    runtimeLogLimitations: RUNTIME_LOG_LIMITATION,
    errorCode: null,
    safeMessage: "Vercel deployment evidence is unavailable.",
    observedAt: now.toISOString(),
    ...overrides,
  };
}

export function getVercelConfigurationPresence(): {
  tokenPresent: boolean;
  teamPresent: boolean;
  projectPresent: boolean;
  canonicalDomainPresent: boolean;
  complete: boolean;
} {
  const tokenPresent = Boolean(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN);
  const teamPresent = Boolean(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID);
  const projectPresent = Boolean(process.env.VERCEL_PROJECT_ID);
  const canonicalDomainPresent = Boolean(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL,
  );
  return {
    tokenPresent,
    teamPresent,
    projectPresent,
    canonicalDomainPresent,
    complete: tokenPresent && teamPresent && projectPresent,
  };
}

export function readVercelDirectConfig(): VercelDirectConfig | null {
  const token = clean(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN);
  const teamId = clean(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID);
  const projectId = clean(process.env.VERCEL_PROJECT_ID);
  if (!token || !teamId || !projectId) return null;
  return {
    token,
    teamId,
    projectId,
    canonicalDomain:
      clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
      clean(process.env.NEXT_PUBLIC_SITE_URL) ??
      clean(process.env.NEXT_PUBLIC_APP_URL),
  };
}

async function apiGet(
  path: string,
  config: VercelDirectConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${API}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data,
      errorCode: response.ok ? null : response.status === 401 || response.status === 403 ? "vercel_unauthorized" : `vercel_http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorCode: error instanceof Error && error.name === "AbortError" ? "vercel_timeout" : "vercel_network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function deploymentHealth(state: string | null): VercelDeploymentHealth {
  const normalized = state?.toUpperCase() ?? "";
  if (["READY", "SUCCEEDED", "SUCCESS"].includes(normalized)) return "healthy";
  if (["ERROR", "FAILED", "FAILURE", "CANCELED", "CANCELLED"].includes(normalized)) return "failed";
  if (["BUILDING", "QUEUED", "INITIALIZING", "PENDING", "IN_PROGRESS"].includes(normalized)) return "pending";
  return "unavailable";
}

function deploymentSha(deployment: VercelDeploymentPayload): string | null {
  const meta = deployment.meta ?? {};
  for (const key of ["githubCommitSha", "githubCommit", "gitCommitSha"]) {
    if (typeof meta[key] === "string" && clean(meta[key] as string)) return clean(meta[key] as string);
  }
  return clean(deployment.gitSource?.sha);
}

function deploymentEnvironment(deployment: VercelDeploymentPayload): VercelDeploymentEnvironment {
  return deployment.target === "production" ? "production" : "preview";
}

function deploymentAliases(
  deployment: VercelDeploymentPayload,
  project: VercelProjectPayload,
): string[] {
  const aliases = [...(deployment.alias ?? [])];
  const production = project.targets?.production;
  if (production && (production.id === deployment.uid || production.id === deployment.id) && Array.isArray(production.alias)) {
    aliases.push(...production.alias);
  }
  return Array.from(new Set(aliases.map((item) => domain(item)).filter((item): item is string => Boolean(item))));
}

function deploymentIdentifier(input: VercelDirectStatusInput): string | null {
  if (clean(input.deploymentId)) return clean(input.deploymentId);
  return domain(input.deploymentUrl);
}

function isProjectMatch(project: VercelProjectPayload, configured: string): boolean {
  return project.id === configured || project.name === configured;
}

export async function readDirectVercelDeploymentStatus(
  input: VercelDirectStatusInput,
): Promise<VercelDeploymentStatusResult> {
  const now = input.now ?? new Date();
  const requestedGitSha = clean(input.requestedGitSha);
  const config = input.config === undefined ? readVercelDirectConfig() : input.config;
  const canonicalDomain = domain(input.canonicalDomain ?? config?.canonicalDomain);
  if (!config) {
    return statusResult(input.environment, now, {
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_configuration_missing",
      safeMessage: "Direct Vercel API configuration is not available.",
    });
  }

  if (clean(input.expectedTeam) && clean(input.expectedTeam) !== config.teamId) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_configuration"],
      teamId: config.teamId,
      projectId: config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_scope_mismatch",
      safeMessage: "The requested team or project does not match the configured AIOS Vercel scope.",
    });
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(500, input.timeoutMs ?? 8_000);
  const teamQuery = new URLSearchParams({ teamId: config.teamId });
  const projectResult = await apiGet(
    `/v9/projects/${encodeURIComponent(config.projectId)}?${teamQuery.toString()}`,
    config,
    fetchImpl,
    timeoutMs,
  );
  if (!projectResult.ok) {
    const misconfigured = projectResult.status === 401 || projectResult.status === 403;
    return statusResult(input.environment, now, {
      status: misconfigured ? "misconfigured" : "unavailable",
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_project"],
      teamId: config.teamId,
      projectId: config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: projectResult.errorCode,
      safeMessage: misconfigured
        ? "Vercel rejected the configured read credential or scope."
        : "The Vercel project identity could not be read.",
    });
  }

  const project = projectResult.data as VercelProjectPayload | null;
  if (!project || typeof project !== "object" || !isProjectMatch(project, config.projectId)) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_project"],
      teamId: config.teamId,
      projectId: project?.id ?? project?.name ?? config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_project_mismatch",
      safeMessage: "Vercel returned a project that does not match the configured AIOS project.",
    });
  }
  const expectedProject = clean(input.expectedProject);
  if (
    expectedProject &&
    ![config.projectId, project.id, project.name].filter(Boolean).includes(expectedProject)
  ) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_project"],
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_project_scope_mismatch",
      safeMessage: "The requested project does not match the configured AIOS Vercel project.",
    });
  }
  if (project.accountId && project.accountId !== config.teamId) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_project"],
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_team_mismatch",
      safeMessage: "Vercel returned a project owned by a different team.",
    });
  }

  let deployment: VercelDeploymentPayload | null = null;
  const identifier = deploymentIdentifier(input);
  if (identifier) {
    const direct = await apiGet(
      `/v13/deployments/${encodeURIComponent(identifier)}?${teamQuery.toString()}`,
      config,
      fetchImpl,
      timeoutMs,
    );
    if (direct.ok && direct.data && typeof direct.data === "object") {
      deployment = direct.data as VercelDeploymentPayload;
    } else if (direct.status === 401 || direct.status === 403) {
      return statusResult(input.environment, now, {
        status: "misconfigured",
        evidenceTier: "direct_vercel_api",
        evidenceSources: ["vercel_project", "vercel_deployment"],
        teamId: config.teamId,
        projectId: project.id ?? project.name ?? config.projectId,
        requestedGitSha,
        canonicalDomain,
        errorCode: "vercel_unauthorized",
        safeMessage: "Vercel rejected deployment read access.",
      });
    }
  }

  if (!deployment) {
    const query = new URLSearchParams({
      teamId: config.teamId,
      projectId: config.projectId,
      limit: "20",
    });
    if (input.environment === "production") query.set("target", "production");
    if (clean(input.branch)) query.set("meta-githubCommitRef", clean(input.branch) as string);

    let cursor: string | null = null;
    for (let page = 0; page < 3 && !deployment; page += 1) {
      if (cursor) query.set("until", cursor);
      const list = await apiGet(`/v6/deployments?${query.toString()}`, config, fetchImpl, timeoutMs);
      if (!list.ok) {
        const misconfigured = list.status === 401 || list.status === 403;
        return statusResult(input.environment, now, {
          status: misconfigured ? "misconfigured" : "unavailable",
          evidenceTier: "direct_vercel_api",
          evidenceSources: ["vercel_project", "vercel_deployments"],
          teamId: config.teamId,
          projectId: project.id ?? project.name ?? config.projectId,
          requestedGitSha,
          canonicalDomain,
          errorCode: list.errorCode,
          safeMessage: misconfigured
            ? "Vercel rejected deployment-list access."
            : "Recent Vercel deployments could not be read.",
        });
      }
      const payload = list.data as { deployments?: VercelDeploymentPayload[]; pagination?: { next?: number | string | null } } | null;
      if (!payload || !Array.isArray(payload.deployments)) {
        return statusResult(input.environment, now, {
          evidenceTier: "direct_vercel_api",
          evidenceSources: ["vercel_project", "vercel_deployments"],
          teamId: config.teamId,
          projectId: project.id ?? project.name ?? config.projectId,
          requestedGitSha,
          canonicalDomain,
          errorCode: "vercel_malformed_response",
          safeMessage: "Vercel returned an invalid deployments response.",
        });
      }
      deployment =
        payload.deployments.find((item) => !requestedGitSha || deploymentSha(item) === requestedGitSha) ??
        payload.deployments[0] ??
        null;
      const next = payload.pagination?.next;
      cursor = next == null ? null : String(next);
      if (!cursor) break;
    }
  }

  if (!deployment) {
    return statusResult(input.environment, now, {
      evidenceTier: "direct_vercel_api",
      evidenceSources: ["vercel_project", "vercel_deployments"],
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      requestedGitSha,
      canonicalDomain,
      errorCode: "vercel_deployment_not_found",
      safeMessage: "No matching Vercel deployment was found.",
    });
  }

  const actualEnvironment = deploymentEnvironment(deployment);
  const gitSha = deploymentSha(deployment);
  const gitShaMatches = requestedGitSha && gitSha ? requestedGitSha === gitSha : null;
  const state = clean(deployment.readyState) ?? clean(deployment.state);
  const health = deploymentHealth(state);
  const deploymentId = clean(deployment.uid) ?? clean(deployment.id);
  const deploymentUrl = url(deployment.url);
  const aliases = deploymentAliases(deployment, project);
  const aliasKnown = Boolean(canonicalDomain && aliases.includes(canonicalDomain));
  const sources = ["vercel_project", "vercel_deployment"];
  if (aliasKnown) sources.push("vercel_alias");

  if (actualEnvironment !== input.environment) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: sources,
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      deploymentId,
      deploymentUrl,
      canonicalDomain,
      gitSha,
      requestedGitSha,
      gitShaMatches,
      deploymentState: clean(deployment.state),
      readyState: clean(deployment.readyState),
      createdAt: timestamp(deployment.createdAt ?? deployment.created),
      completedAt: timestamp(deployment.readyAt ?? deployment.ready),
      errorCode: "vercel_environment_mismatch",
      safeMessage: "The Vercel deployment environment does not match the requested environment.",
    });
  }
  if (gitShaMatches === false) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: sources,
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      deploymentId,
      deploymentUrl,
      canonicalDomain,
      gitSha,
      requestedGitSha,
      gitShaMatches,
      deploymentState: clean(deployment.state),
      readyState: clean(deployment.readyState),
      createdAt: timestamp(deployment.createdAt ?? deployment.created),
      completedAt: timestamp(deployment.readyAt ?? deployment.ready),
      errorCode: "vercel_git_sha_mismatch",
      safeMessage: "The Vercel deployment Git SHA does not match the requested SHA.",
    });
  }
  if (input.environment === "production" && canonicalDomain && aliases.length > 0 && !aliasKnown) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "direct_vercel_api",
      evidenceSources: sources,
      teamId: config.teamId,
      projectId: project.id ?? project.name ?? config.projectId,
      deploymentId,
      deploymentUrl,
      canonicalDomain,
      gitSha,
      requestedGitSha,
      gitShaMatches,
      deploymentState: clean(deployment.state),
      readyState: clean(deployment.readyState),
      createdAt: timestamp(deployment.createdAt ?? deployment.created),
      completedAt: timestamp(deployment.readyAt ?? deployment.ready),
      errorCode: "vercel_alias_mismatch",
      safeMessage: "The configured production domain is not assigned to the matching Vercel deployment.",
    });
  }

  let buildEventsAvailable = false;
  if (deploymentId) {
    const events = await apiGet(
      `/v3/deployments/${encodeURIComponent(deploymentId)}/events?${new URLSearchParams({ teamId: config.teamId, limit: "100" }).toString()}`,
      config,
      fetchImpl,
      timeoutMs,
    );
    const eventPayload = events.data as { events?: unknown[] } | unknown[] | null;
    buildEventsAvailable = events.ok && (Array.isArray(eventPayload) || Array.isArray((eventPayload as { events?: unknown[] } | null)?.events));
    if (buildEventsAvailable) sources.push("vercel_deployment_events");
  }

  return statusResult(input.environment, now, {
    status: health,
    evidenceTier: "direct_vercel_api",
    evidenceSources: sources,
    teamId: config.teamId,
    projectId: project.id ?? project.name ?? config.projectId,
    deploymentId,
    deploymentUrl,
    canonicalDomain,
    gitSha,
    requestedGitSha,
    gitShaMatches,
    deploymentState: clean(deployment.state),
    readyState: clean(deployment.readyState),
    createdAt: timestamp(deployment.createdAt ?? deployment.created ?? deployment.buildingAt),
    completedAt: timestamp(deployment.readyAt ?? deployment.ready),
    requiredChecksPassed: health === "healthy" ? true : health === "pending" ? false : health === "failed" ? false : null,
    buildEventsAvailable,
    runtimeLogsAvailable: false,
    runtimeLogLimitations: RUNTIME_LOG_LIMITATION,
    errorCode: health === "unavailable" ? "vercel_unknown_deployment_state" : null,
    safeMessage:
      health === "healthy"
        ? aliasKnown || input.environment === "preview"
          ? "Vercel reports the matching deployment ready."
          : "Vercel reports the deployment ready; the canonical alias was not independently present in deployment evidence."
        : health === "pending"
          ? "The matching Vercel deployment is still pending."
          : health === "failed"
            ? "The matching Vercel deployment failed."
            : "Vercel returned an unknown deployment state.",
  });
}

export function normalizeGitHubVercelEvidence(input: {
  evidence: GitHubVercelEvidence | null;
  environment: VercelDeploymentEnvironment;
  requestedGitSha?: string | null;
  canonicalDomain?: string | null;
  now?: Date;
}): VercelDeploymentStatusResult {
  const now = input.now ?? new Date();
  const requestedGitSha = clean(input.requestedGitSha);
  const evidence = input.evidence;
  if (!evidence || evidence.status === "unavailable") {
    return statusResult(input.environment, now, {
      requestedGitSha,
      canonicalDomain: domain(input.canonicalDomain),
      errorCode: "github_vercel_evidence_unavailable",
      safeMessage: "GitHub has no usable Vercel deployment evidence.",
    });
  }
  const environment = evidence.environment === "production" ? "production" : "preview";
  const gitSha = clean(evidence.gitSha);
  const gitShaMatches = requestedGitSha && gitSha ? requestedGitSha === gitSha : null;
  if (environment !== input.environment || gitShaMatches === false) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "github_vercel_deployment_status",
      evidenceSources: evidence.sources ?? ["github_vercel_status"],
      deploymentId: evidence.deploymentId == null ? null : String(evidence.deploymentId),
      deploymentUrl: url(evidence.deploymentUrl),
      canonicalDomain: domain(input.canonicalDomain),
      gitSha,
      requestedGitSha,
      gitShaMatches,
      deploymentState: evidence.status,
      readyState: evidence.status,
      createdAt: evidence.createdAt ?? null,
      completedAt: evidence.completedAt ?? null,
      requiredChecksPassed: false,
      errorCode: environment !== input.environment ? "github_vercel_environment_mismatch" : "github_vercel_git_sha_mismatch",
      safeMessage: "GitHub Vercel evidence does not match the requested environment or Git SHA.",
    });
  }
  const health = evidence.status === "success" ? "healthy" : evidence.status === "pending" ? "pending" : "failed";
  return statusResult(input.environment, now, {
    status: health,
    evidenceTier: "github_vercel_deployment_status",
    evidenceSources: evidence.sources ?? ["github_vercel_status"],
    deploymentId: evidence.deploymentId == null ? null : String(evidence.deploymentId),
    deploymentUrl: url(evidence.deploymentUrl),
    canonicalDomain: domain(input.canonicalDomain),
    gitSha,
    requestedGitSha,
    gitShaMatches,
    deploymentState: evidence.status,
    readyState: evidence.status,
    createdAt: evidence.createdAt ?? null,
    completedAt: evidence.completedAt ?? null,
    requiredChecksPassed: health === "healthy",
    runtimeLogsAvailable: false,
    runtimeLogLimitations: RUNTIME_LOG_LIMITATION,
    safeMessage:
      health === "healthy"
        ? "GitHub reports a successful Vercel deployment for the matching SHA; this is not direct Vercel API or production-alias proof."
        : health === "pending"
          ? "GitHub reports the Vercel deployment is pending."
          : "GitHub reports the Vercel deployment failed.",
  });
}

export function normalizeRuntimeDeploymentIdentity(input: {
  identity: RuntimeDeploymentIdentity | null;
  environment: VercelDeploymentEnvironment;
  requestedGitSha?: string | null;
  canonicalDomain?: string | null;
  now?: Date;
}): VercelDeploymentStatusResult {
  const now = input.now ?? new Date();
  const requestedGitSha = clean(input.requestedGitSha);
  const identity = input.identity;
  if (!identity?.commitSha) {
    return statusResult(input.environment, now, {
      requestedGitSha,
      canonicalDomain: domain(input.canonicalDomain),
      errorCode: "runtime_identity_unavailable",
      safeMessage: "Runtime deployment identity is unavailable.",
    });
  }
  const environment: VercelDeploymentEnvironment = identity.environment === "production" ? "production" : "preview";
  const gitShaMatches = requestedGitSha ? requestedGitSha === identity.commitSha : null;
  if (environment !== input.environment || gitShaMatches === false) {
    return statusResult(input.environment, now, {
      status: "misconfigured",
      evidenceTier: "runtime_deployment_identity",
      evidenceSources: ["runtime_deployment_identity"],
      deploymentId: identity.vercelDeploymentId,
      canonicalDomain: domain(input.canonicalDomain),
      gitSha: identity.commitSha,
      requestedGitSha,
      gitShaMatches,
      deploymentState: identity.environment,
      readyState: null,
      createdAt: identity.buildTimestamp,
      completedAt: null,
      requiredChecksPassed: null,
      errorCode: environment !== input.environment ? "runtime_environment_mismatch" : "runtime_git_sha_mismatch",
      safeMessage: "The running deployment identity does not match the requested environment or Git SHA.",
    });
  }
  return statusResult(input.environment, now, {
    status: "healthy",
    evidenceTier: "runtime_deployment_identity",
    evidenceSources: ["runtime_deployment_identity"],
    deploymentId: identity.vercelDeploymentId,
    canonicalDomain: domain(input.canonicalDomain),
    gitSha: identity.commitSha,
    requestedGitSha,
    gitShaMatches,
    deploymentState: identity.environment,
    readyState: null,
    createdAt: identity.buildTimestamp,
    completedAt: null,
    requiredChecksPassed: null,
    safeMessage: "The running build identity matches; this does not independently prove Vercel project state, checks, aliases, or logs.",
  });
}

export function selectVercelEvidence(
  results: VercelDeploymentStatusResult[],
): VercelDeploymentStatusResult {
  const available = results.filter((result) => result.evidenceTier !== "unavailable");
  if (available.length === 0) return results.at(-1) ?? statusResult("preview", new Date(), {});

  const knownShas = new Set(available.map((result) => result.gitSha).filter((sha): sha is string => Boolean(sha)));
  const environments = new Set(available.map((result) => result.environment));
  if (knownShas.size > 1 || environments.size > 1) {
    const strongest = available[0];
    return {
      ...strongest,
      status: "misconfigured",
      evidenceSources: Array.from(new Set(available.flatMap((result) => result.evidenceSources))),
      requiredChecksPassed: false,
      errorCode: "vercel_evidence_conflict",
      safeMessage: "Vercel evidence sources disagree on deployment identity.",
    };
  }

  const strongest = available[0];
  return {
    ...strongest,
    evidenceSources: Array.from(new Set(available.flatMap((result) => result.evidenceSources))),
  };
}

export function evaluateVercelReadiness(
  result: VercelDeploymentStatusResult,
  options: { requireChecks?: boolean; requireProductionAlias?: boolean } = {},
): VercelReadinessResult {
  if (result.status !== "healthy") return { ready: false, code: `vercel_${result.status}` };
  if (result.requestedGitSha && result.gitShaMatches !== true) return { ready: false, code: "vercel_git_sha_unproven" };
  if (options.requireChecks && result.requiredChecksPassed !== true) return { ready: false, code: "vercel_required_checks_unproven" };
  if (
    options.requireProductionAlias &&
    result.environment === "production" &&
    !result.evidenceSources.includes("vercel_alias") &&
    !(result.evidenceSources.includes("github_vercel_deployment") && result.evidenceSources.includes("runtime_deployment_identity"))
  ) {
    return { ready: false, code: "vercel_production_alias_unproven" };
  }
  return { ready: true, code: "vercel_ready" };
}

export function redactVercelError(value: unknown): string {
  if (!(value instanceof Error)) return "vercel_request_failed";
  return value.message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 240);
}

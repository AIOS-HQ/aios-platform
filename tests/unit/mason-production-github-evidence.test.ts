import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasonClosedLoopAdapters, MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";
import { createMasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";

const runLoopMock = vi.fn();
const runGithubReadMock = vi.fn();
const vercelStatusMock = vi.fn();
const boundedCiPollSpy = vi.fn();
const FIXTURE_REPOSITORY = "AIOS-HQ/aios-platform";
const FIXTURE_PR_NUMBER = 77;
const FIXTURE_BRANCH = "mason/runtime-evidence-founder-1";
const FIXTURE_HEAD_SHA = "abc123";

function healthyVercel() {
  return {
    status: "healthy",
    evidenceTier: "github_vercel_deployment_status",
    evidenceSources: ["github_vercel_status"],
    environment: "preview",
    requestedGitSha: "abc123",
    gitSha: "abc123",
    gitShaMatches: true,
    requiredChecksPassed: true,
  };
}

const RUNTIME_TASK = createMasonEngineeringTaskContract({
  objective: "Validate the exact PR head",
  repository: FIXTURE_REPOSITORY,
  executionIdentity: {
    executionId: "exec-fixture",
    correlationId: "corr-fixture",
    source: "test",
  },
  requestedOutcome: "open_pull_request",
  branchName: FIXTURE_BRANCH,
  fileChanges: [{ path: "src/lib/example.ts", content: "export const example = true;\n" }],
});
const REQUIRED_ALIASES = [...RUNTIME_TASK.requiredCheckAliases];

function fullEvidenceRuns(
  status: "queued" | "in_progress" | "completed",
  conclusion: string | null,
  headSha = "abc123",
  overrides?: Partial<Record<string, { status?: "queued" | "in_progress" | "completed"; conclusion?: string | null }>>,
) {
  function hasOwnOverrideConclusion(value: { status?: "queued" | "in_progress" | "completed"; conclusion?: string | null } | undefined): value is { status?: "queued" | "in_progress" | "completed"; conclusion: string | null } {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, "conclusion"));
  }
  return REQUIRED_ALIASES.map((alias, index) => ({
    name: alias,
    status: overrides?.[alias]?.status ?? status,
    conclusion: hasOwnOverrideConclusion(overrides?.[alias]) ? overrides?.[alias].conclusion : conclusion,
    head_sha: headSha,
    repository: FIXTURE_REPOSITORY,
    pr_number: FIXTURE_PR_NUMBER,
    head_branch: FIXTURE_BRANCH,
    workflow_id: 1000 + index,
    id: 2000 + index,
    updated_at: "2026-07-24T00:00:00.000Z",
  }));
}

vi.mock("@/lib/workforce/mason-closed-loop", () => ({
  runMasonClosedLoopExecution: (...args: unknown[]) => runLoopMock(...args),
}));
vi.mock("@/lib/workforce/mason-ci-watch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workforce/mason-ci-watch")>("@/lib/workforce/mason-ci-watch");
  return {
    ...actual,
    boundedCiPoll: (...args: unknown[]) => {
      boundedCiPollSpy(...args);
      return (actual.boundedCiPoll as (...inner: unknown[]) => unknown)(...args);
    },
  };
});
vi.mock("@/lib/integrations/clients/github", () => ({
  runGithubRead: (...args: unknown[]) => runGithubReadMock(...args),
}));
vi.mock("@/lib/integrations/clients/vercel", () => ({
  getCanonicalVercelDeploymentStatus: (...args: unknown[]) => vercelStatusMock(...args),
}));
vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  runMasonProductionRuntime: vi.fn(async (input) => ({
    status: "completed",
    summary: "runtime complete",
    pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/77",
    previewUrl: "https://preview.example.vercel.app",
    executionId: input.executionIdentity.executionId,
    branch: input.branchName,
    commitSha: FIXTURE_HEAD_SHA,
    pullRequestNumber: 77,
    validationMode: "external_ci",
  })),
}));
vi.mock("@/lib/julius/mason-retrieval", () => ({
  retrieveMasonExecutionContext: vi.fn(async (input: { context: Record<string, unknown> }) => ({
    status: "found",
    context: {
      ...input.context,
      timestamp: new Date().toISOString(),
    },
    entries: [],
    degraded: false,
    error: null,
  })),
}));
vi.mock("@/lib/workforce/mason-learning", () => ({
  recordMasonEngineeringLearning: vi.fn(async () => ({ julius: { status: "written" }, companySkill: null })),
}));
vi.mock("@/lib/harmony/code/mason-ledger", async () => {
  const actual = await vi.importActual<typeof import("@/lib/harmony/code/mason-ledger")>("@/lib/harmony/code/mason-ledger");
  return {
    ...actual,
    appendMasonLedgerEvent: vi.fn(async () => ({ id: "ledger-1" })),
    listMasonExecutionTimeline: vi.fn(async () => []),
  };
});

const requesterAuthorization = {
  role: "admin" as const,
  verified: true,
  source: "server_session" as const,
};

async function executeAdapters(
  callback: (input: MasonClosedLoopInput, adapters: MasonClosedLoopAdapters) => Promise<void>,
) {
  runLoopMock.mockImplementationOnce(async (input: MasonClosedLoopInput, adapters: MasonClosedLoopAdapters) => {
    await adapters.runExecution({ ...input, plan: { summary: "grounded" } });
    await callback(input, adapters);
    return {
      executionId: input.executionId,
      correlationId: input.correlationId,
      terminalState: "escalated",
      states: [],
      report: { terminalState: "escalated" },
    };
  });
  const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
  return handleMasonEngineeringMessage({
    userId: "founder-1",
    companyId: "co-1",
    repository: "AIOS-HQ/aios-platform",
    message: "Validate the exact PR head",
    founderApproved: true,
    requesterAuthorization,
    requestedOutcome: "open_pull_request",
    branchName: FIXTURE_BRANCH,
    fileChanges: [{ path: "src/lib/example.ts", content: "export const example = true;\n" }],
  });
}

describe("mason production GitHub evidence binding", () => {
  beforeEach(() => {
    runLoopMock.mockReset();
    runGithubReadMock.mockReset();
    vercelStatusMock.mockReset();
    boundedCiPollSpy.mockReset();
    vi.clearAllMocks();
    vercelStatusMock.mockResolvedValue(healthyVercel());
  });

  it("reads exact CI evidence only after the production runtime returns a PR identity", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: fullEvidenceRuns("completed", "success") },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(ci).toMatchObject({ status: "passed", requiredChecksPassed: true, headSha: "abc123" });
    });
    expect(runGithubReadMock).toHaveBeenCalledWith("founder-1", "review_build_result", {
      repo: "AIOS-HQ/aios-platform",
    });
  });

  it.each([
    ["in_progress", null, "pending"],
    ["completed", "failure", "failed"],
    ["completed", "success", "passed"],
  ] as const)("classifies %s/%s CI evidence as %s", async (status, conclusion, expected) => {
    const pendingAlias = REQUIRED_ALIASES[0];
    if (!pendingAlias) throw new Error("missing_required_alias_fixture");
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: {
        runs:
          status === "in_progress"
            ? fullEvidenceRuns("completed", "success", "abc123", { [pendingAlias]: { status: "in_progress", conclusion: null } })
            : fullEvidenceRuns(status as "completed", conclusion),
      },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      if (status === "in_progress") {
        expect(boundedCiPollSpy).toHaveBeenCalledWith(
          expect.objectContaining({ pendingExhaustionStrategy: "return_latest_pending" }),
          expect.anything(),
          expect.any(Function),
          expect.any(Function),
        );
      }
      expect(ci.status).toBe(expected);
    });
  });

  it("tracks pending exact evidence through bounded poll and final mapping", async () => {
    const pendingAlias = REQUIRED_ALIASES[0];
    if (!pendingAlias) throw new Error("missing_required_alias_fixture");
    expect(REQUIRED_ALIASES).toStrictEqual(RUNTIME_TASK.requiredCheckAliases);
    const pendingRuns = fullEvidenceRuns("completed", "success", FIXTURE_HEAD_SHA, {
      [pendingAlias]: { status: "in_progress", conclusion: null },
    });
    const rawAliases = pendingRuns.map((run) => run.name);
    expect(rawAliases).toStrictEqual(RUNTIME_TASK.requiredCheckAliases);
    const rawAliasCounts = new Map<string, number>();
    for (const alias of rawAliases) {
      rawAliasCounts.set(alias, (rawAliasCounts.get(alias) ?? 0) + 1);
    }
    expect([...rawAliasCounts.values()].every((count) => count === 1)).toBe(true);
    expect(new Set(rawAliases).size).toBe(RUNTIME_TASK.requiredCheckAliases.length);
    const rawPendingAliases = pendingRuns.filter((run) => run.status === "in_progress" && run.conclusion === null).map((run) => run.name);
    expect(rawPendingAliases).toHaveLength(1);
    expect(rawPendingAliases[0]).toBe(pendingAlias);
    const rawNonPending = pendingRuns.filter((run) => run.name !== pendingAlias);
    expect(rawNonPending.every((run) => run.status === "completed" && run.conclusion === "success")).toBe(true);

    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: {
        runs: pendingRuns,
      },
    });

    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(ci.status).toBe("pending");
      expect(ci.detail).toBe("required_checks_pending");
      expect(ci.requiredChecksPassed).toBe(false);
    });
  });

  it("never converts green CI and Preview evidence into Mason merge authority", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: fullEvidenceRuns("completed", "success") },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
      expect(gate).toMatchObject({ ready: false, detail: "founder_merge_authorization_required" });
      await expect(adapters.performMerge(input)).rejects.toThrow("mason_has_no_merge_authority");
    });
  });

  it("blocks mismatched exact-head or Preview deployment evidence", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: fullEvidenceRuns("completed", "success", "different") },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
      expect(gate).toMatchObject({ ready: false, detail: "stale" });
    });

    vercelStatusMock.mockResolvedValueOnce({ ...healthyVercel(), status: "failed", gitShaMatches: false });
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: fullEvidenceRuns("completed", "success") },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
      expect(gate).toMatchObject({ ready: false, detail: "vercel_failed" });
    });
  });

  it("fails closed when required checks are incomplete", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: [fullEvidenceRuns("completed", "success")[0]] },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(ci).toMatchObject({ status: "failed", detail: "required_checks_missing", requiredChecksPassed: false });
    });
  });
});

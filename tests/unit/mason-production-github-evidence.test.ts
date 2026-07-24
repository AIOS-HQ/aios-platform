import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasonClosedLoopAdapters, MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";

const runLoopMock = vi.fn();
const runGithubReadMock = vi.fn();
const vercelStatusMock = vi.fn();

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

vi.mock("@/lib/workforce/mason-closed-loop", () => ({
  runMasonClosedLoopExecution: (...args: unknown[]) => runLoopMock(...args),
}));
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
    commitSha: "abc123",
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
    branchName: "mason/runtime-evidence",
    fileChanges: [{ path: "src/lib/example.ts", content: "export const example = true;\n" }],
  });
}

describe("mason production GitHub evidence binding", () => {
  beforeEach(() => {
    runLoopMock.mockReset();
    runGithubReadMock.mockReset();
    vercelStatusMock.mockReset();
    vercelStatusMock.mockResolvedValue(healthyVercel());
  });

  it("reads exact CI evidence only after the production runtime returns a PR identity", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] },
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
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: [{ status, conclusion, head_sha: "abc123" }] },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(ci.status).toBe(expected);
    });
  });

  it("never converts green CI and Preview evidence into Mason merge authority", async () => {
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] },
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
      data: { runs: [{ status: "completed", conclusion: "success", head_sha: "different" }] },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
      expect(gate).toMatchObject({ ready: false, detail: "stale_or_missing_head_sha" });
    });

    vercelStatusMock.mockResolvedValueOnce({ ...healthyVercel(), status: "failed", gitShaMatches: false });
    runGithubReadMock.mockResolvedValue({
      ok: true,
      data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] },
    });
    await executeAdapters(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
      expect(gate).toMatchObject({ ready: false, detail: "vercel_failed" });
    });
  });
});

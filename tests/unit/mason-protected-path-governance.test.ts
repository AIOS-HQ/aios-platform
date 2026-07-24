import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";
import { createMasonExecutionIdentity } from "@/lib/harmony/code/mason-execution-identity";

const createApprovalPayloadMock = vi.fn(async (_userId, _companyId, payload) => payload);

vi.mock("@/lib/harmony/autonomy/data-access", () => ({
  getActiveDirectives: vi.fn(async () => []),
  createApprovalPayload: (...args: unknown[]) => createApprovalPayloadMock(...args),
}));

function task(path: string) {
  const executionIdentity = createMasonExecutionIdentity({
    userId: "founder-1",
    companyId: "company-1",
    actorId: "founder-1",
    source: "founder_session",
    repository: "AIOS-HQ/aios-platform",
    objective: "Update a protected path",
    correlationId: "protected-governance",
  });
  return createMasonEngineeringTaskContract({
    objective: "Update a protected path",
    repository: "AIOS-HQ/aios-platform",
    executionIdentity,
    requestedOutcome: "open_pull_request",
    branchName: "mason/protected-governance",
    fileChanges: [{ path, content: "export const governed = true;\n" }],
  });
}

describe("Mason protected-path governance", () => {
  beforeEach(() => createApprovalPayloadMock.mockClear());

  it("requires a persisted Founder approval even at executive autonomy", async () => {
    const { determineMasonExecutionReadiness } = await import("@/lib/harmony/autonomy/mason-integration");
    const contract = task(".github/workflows/launch-validation.yml");
    const readiness = await determineMasonExecutionReadiness(
      "founder-1",
      "company-1",
      contract.objective,
      contract.repository,
      4,
      false,
      { taskContract: contract },
    );
    expect(readiness).toMatchObject({ ready_now: false, requires_approval: true, is_blocked: false });
    expect(createApprovalPayloadMock).toHaveBeenCalledTimes(1);
    const stored = createApprovalPayloadMock.mock.calls[0]?.[2];
    expect(stored.original_params).toMatchObject({
      executionIdentity: { executionId: contract.executionIdentity.executionId },
      protectedResources: [expect.objectContaining({ kind: "github_workflows" })],
      taskContract: { version: "mason.engineering-task.v1" },
    });
  });

  it("resumes only the approved persisted task contract", async () => {
    const { determineMasonExecutionReadiness } = await import("@/lib/harmony/autonomy/mason-integration");
    const contract = task("supabase/migrations/20260724000000_example.sql");
    const readiness = await determineMasonExecutionReadiness(
      "founder-1",
      "company-1",
      contract.objective,
      contract.repository,
      0,
      true,
      { taskContract: contract },
    );
    expect(readiness).toMatchObject({ ready_now: true, requires_approval: false, is_blocked: false });
    expect(createApprovalPayloadMock).not.toHaveBeenCalled();
  });
});

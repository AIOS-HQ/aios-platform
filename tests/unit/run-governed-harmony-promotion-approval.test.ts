import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { M5_BOOTSTRAP_PROMOTION_REQUEST_ID } from "../../src/lib/promotion/request-id";

const createClientMock = vi.hoisted(() => vi.fn());
const runDiagnosticMock = vi.hoisted(() => vi.fn());
const writeHarmonyMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("../../src/lib/promotion/approval-evidence-shared", () => ({
  runPromotionPersistenceReadOnlyDiagnosticWithClient: runDiagnosticMock,
}));

vi.mock("../../src/lib/promotion/evidence-store", () => ({
  HARMONY_POLICY_VERSION: "production-promotion-governance-v1",
  writeHarmonyPromotionDecision: writeHarmonyMock,
}));

function createReadClientForRequest(requestData: Record<string, unknown>) {
  const singleMock = vi.fn(async () => ({ data: requestData, error: null }));
  const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock, single: singleMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    client: { from: fromMock },
    fromMock,
  };
}

describe("run-governed-harmony-promotion-approval", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://vgsqgxpwjnwssconsptn.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };

    const { client } = createReadClientForRequest({
      promotion_request_id: M5_BOOTSTRAP_PROMOTION_REQUEST_ID,
      target_sha: "02ab3a7a083c56feb17211fa62c85b3bacfce34a",
      migration_evidence_id: "migration:7129b9249d0d44f98a09ae043db8885a4aa7205c5fa44b1392bf532bd1cc4ff6",
      migration_artifact_id: "github-artifact:9263764663",
      runtime_evidence_id: null,
      runtime_artifact_id: null,
      preview_certification_waiver: true,
      preview_certification_waiver_reason: "preview_certification_contract_incompatibility",
    });

    createClientMock.mockReturnValue(client);

    runDiagnosticMock
      .mockResolvedValueOnce({
        requestExists: true,
        founderDecisionExists: true,
        harmonyDecisionExists: false,
      })
      .mockResolvedValueOnce({
        requestExists: true,
        founderDecisionExists: true,
        harmonyDecisionExists: true,
      });

    writeHarmonyMock.mockResolvedValue({
      decision: {
        decision_source: "harmony",
        decision: "approved",
        policy_version: "production-promotion-governance-v1",
        evidence_id: "harmony-evidence:abc123",
        approved_at: "2026-08-22T22:00:00.000Z",
      },
    });
  });

  it("persists harmony approval through the existing governed writer and writes artifact", async () => {
    const { runGovernedHarmonyPromotionApproval } = await import("../../scripts/ci/run-governed-harmony-promotion-approval");
    const dir = mkdtempSync(join(tmpdir(), "harmony-governed-"));

    try {
      const outputPath = join(dir, "artifact.json");
      const result = await runGovernedHarmonyPromotionApproval(M5_BOOTSTRAP_PROMOTION_REQUEST_ID, outputPath);
      const persisted = JSON.parse(readFileSync(outputPath, "utf8"));

      expect(result.promotionRequestId).toBe(M5_BOOTSTRAP_PROMOTION_REQUEST_ID);
      expect(result.founderDecisionExistsBefore).toBe(true);
      expect(result.harmonyDecisionExistsAfter).toBe(true);
      expect(result.harmonyDecision.source).toBe("harmony");
      expect(result.harmonyDecision.decision).toBe("approved");
      expect(persisted.harmonyDecision.evidenceId).toBe("harmony-evidence:abc123");

      expect(writeHarmonyMock).toHaveBeenCalledWith({
        promotionRequestId: M5_BOOTSTRAP_PROMOTION_REQUEST_ID,
      });
      expect(runDiagnosticMock).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when founder decision precondition is missing", async () => {
    runDiagnosticMock.mockReset();
    runDiagnosticMock.mockResolvedValue({
      requestExists: true,
      founderDecisionExists: false,
      harmonyDecisionExists: false,
    });

    const { runGovernedHarmonyPromotionApproval } = await import("../../scripts/ci/run-governed-harmony-promotion-approval");

    await expect(
      runGovernedHarmonyPromotionApproval(M5_BOOTSTRAP_PROMOTION_REQUEST_ID, join(tmpdir(), "never.json")),
    ).rejects.toThrow("founder_decision_missing_precondition");

    expect(writeHarmonyMock).not.toHaveBeenCalled();
  });

  it("fails closed on non-canonical promotion request id", async () => {
    const { runGovernedHarmonyPromotionApproval } = await import("../../scripts/ci/run-governed-harmony-promotion-approval");

    await expect(
      runGovernedHarmonyPromotionApproval(
        "promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a",
        join(tmpdir(), "never.json"),
      ),
    ).rejects.toThrow("promotion_request_id_not_authorized");

    expect(runDiagnosticMock).not.toHaveBeenCalled();
    expect(writeHarmonyMock).not.toHaveBeenCalled();
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const loadSharedMock = vi.fn();
const validateMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("../../src/lib/promotion/approval-evidence-shared", () => ({
  loadPersistedPromotionApprovalEvidenceWithClient: loadSharedMock,
}));
vi.mock("../../scripts/ci/promotion-approval-evidence.mjs", () => ({
  validatePromotionApprovalEvidence: validateMock,
}));

const safePayload = {
  subject: { targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300" },
  founderApproval: { status: "approved" },
  harmonyGovernanceApproval: { status: "approved" },
  bundleId: "promotion-approval-bundle:abc",
};

describe("exportPersistedPromotionApprovalEvidence", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
    createClientMock.mockReturnValue({ from: vi.fn() });
    loadSharedMock.mockResolvedValue({ any: "mapped" });
    validateMock.mockReturnValue(safePayload);
  });

  it("uses service-role client, shared loader, validates expected SHA, and writes safe JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "promotion-approval-export-"));
    try {
      const out = join(dir, "approval.json");
      const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");

      const result = await exportPersistedPromotionApprovalEvidence(
        "promotion-request:abc123",
        "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
        out,
      );

      expect(createClientMock).toHaveBeenCalledTimes(1);
      expect(loadSharedMock).toHaveBeenCalledTimes(1);
      expect(validateMock).toHaveBeenCalledWith({ any: "mapped" }, { expectedSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300" });
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(safePayload);
      expect(result).toEqual(safePayload);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when credentials are missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "supabase_admin_unavailable",
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when shared loader fails", async () => {
    loadSharedMock.mockRejectedValue(new Error("founder_decision_missing"));
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "founder_decision_missing",
    );
  });

  it("fails closed when expected SHA validation fails", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("target_sha_mismatch");
    });
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "target_sha_mismatch",
    );
  });
});

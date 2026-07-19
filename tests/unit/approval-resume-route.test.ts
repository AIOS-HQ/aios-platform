import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const resolvePrimaryCompanyId = vi.fn();
const getApprovalPayload = vi.fn();
const getApprovedApprovalPayload = vi.fn();
const approveApproval = vi.fn();
const rejectApproval = vi.fn();
const resumeApprovedExecution = vi.fn();
const recordRejectedExecution = vi.fn();

vi.mock("@/lib/auth/user", () => ({ getCurrentUser }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId }));
vi.mock("@/lib/harmony/autonomy/data-access", () => ({
  getApprovalPayload,
  getApprovedApprovalPayload,
  approveApproval,
  rejectApproval,
  getApprovalById: vi.fn(),
}));
vi.mock("@/lib/harmony/autonomy/execution-resumption", () => ({
  resumeApprovedExecution,
  recordRejectedExecution,
}));
vi.mock("@/lib/event-mesh/publish", () => ({
  eventForReference: vi.fn((x: unknown) => x),
  publishAiosEventBestEffort: vi.fn(async () => {}),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/harmony/autonomy/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("approval resume route semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "founder-1" });
    resolvePrimaryCompanyId.mockResolvedValue("company-1");
    getApprovalPayload.mockResolvedValue({
      approval_id: "approval-1",
      original_agent: "mason",
      original_domain: "engineering",
      original_action: "merge_pull_request",
      original_params: { objective: "merge", repository: "AIOS-HQ/aios-platform" },
      required_context: {},
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    });
    approveApproval.mockResolvedValue(true);
    getApprovedApprovalPayload.mockResolvedValue({
      approval_id: "approval-1",
      original_actor: "founder",
      original_agent: "mason",
      original_domain: "engineering",
      original_action: "merge_pull_request",
      original_params: { objective: "merge", repository: "AIOS-HQ/aios-platform" },
      required_context: {},
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    });
    rejectApproval.mockResolvedValue(true);
    recordRejectedExecution.mockResolvedValue({});
  });

  it("accepts valid approval even when downstream execution is blocked and does not return 400", async () => {
    resumeApprovedExecution.mockResolvedValue({
      ok: false,
      error: "Mason runtime blocked. GitHub=true, Vercel=false, Harmony=true.",
      execution_result: {
        status: "blocked",
        required_approval: true,
        approval_id: "approval-1",
        founder_approved_at: "2026-01-01T00:00:01Z",
      },
    });

    const { POST } = await import("@/app/api/harmony/autonomy/approve/route");
    const res = await POST(req({ approval_id: "approval-1", decision: "approve" }));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("approved_blocked");
    expect(approveApproval).toHaveBeenCalledWith("founder-1", "approval-1");
    expect(resumeApprovedExecution).toHaveBeenCalledTimes(1);
  });

  it("keeps idempotent behavior on repeated approve after already approved", async () => {
    getApprovalPayload.mockResolvedValueOnce(null);
    const getApproved = vi
      .fn()
      .mockResolvedValue({
        approval_id: "approval-1",
        status: "approved",
        founder_approved_at: "2026-01-01T00:00:01Z",
      });

    const mod = await import("@/lib/harmony/autonomy/data-access");
    (mod as unknown as { getApprovalById?: typeof getApproved }).getApprovalById = getApproved;

    const { POST } = await import("@/app/api/harmony/autonomy/approve/route");
    const res = await POST(req({ approval_id: "approval-1", decision: "approve" }));

    expect(res.status).toBe(200);
    expect(resumeApprovedExecution).not.toHaveBeenCalled();
  });

  it("returns 409 approval_revoked when approved payload cannot be loaded for resume", async () => {
    resumeApprovedExecution.mockResolvedValue({ ok: false, error: "approval_not_found_or_not_approved" });
    const { POST } = await import("@/app/api/harmony/autonomy/approve/route");
    const res = await POST(req({ approval_id: "approval-1", decision: "approve" }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("approval_revoked");
  });

  it("returns 400 only for malformed request", async () => {
    const { POST } = await import("@/app/api/harmony/autonomy/approve/route");
    const res = await POST(req({ decision: "approve" }));
    expect(res.status).toBe(400);
  });

  it("keeps reject semantics and no resume", async () => {
    const { POST } = await import("@/app/api/harmony/autonomy/approve/route");
    const res = await POST(req({ approval_id: "approval-1", decision: "reject", reason: "not now" }));
    expect(res.status).toBe(200);
    expect(rejectApproval).toHaveBeenCalledWith("founder-1", "approval-1", "not now");
    expect(recordRejectedExecution).toHaveBeenCalledTimes(1);
    expect(resumeApprovedExecution).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => "en"),
}));
vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: "founder-1" })) }));
vi.mock("@/lib/data/os/companies", () => ({ listCompanies: vi.fn(async () => [{ id: "company-1", name: "AIOS" }]) }));
vi.mock("@/lib/data/os/departments", () => ({ listDepartments: vi.fn(async () => []) }));
vi.mock("@/lib/data/os/approvals", () => ({
  listApprovalsUnified: vi.fn(async () => [
    {
      id: "spine-row",
      company_id: "company-1",
      status: "pending",
      source: "spine",
      title: "mason · open_pull_request",
      summary: "Approval payload: approval_42",
      risk: "medium",
      type: "open_pull_request",
      created_at: "2026-07-18T10:00:00Z",
      decided_at: null,
      expires_at: null,
      department_id: null,
      work_item_id: null,
      message_id: null,
      agent_message_id: null,
    },
  ]),
}));
vi.mock("@/lib/harmony/autonomy/review-queue", () => ({
  listPendingApprovalsForReview: vi.fn(async () => [
    {
      approvalId: "approval_42",
      agent: "mason",
      agentName: "Mason",
      label: "mason.open_pull_request",
      destructive: false,
    },
  ]),
}));
vi.mock("@/components/harmony/workforce/review-queue", () => ({
  ReviewQueue: ({ approvals }: { approvals?: Array<{ approvalId: string }> }) =>
    ({ type: "review-queue", approvals } as unknown),
}));

vi.mock("@/lib/harmony/os/approval-actions", () => ({
  decideApproval: vi.fn(async () => {}),
  deleteApproval: vi.fn(async () => {}),
}));

describe("Approval Center spine actions", () => {
  it("renders spine approvals via canonical ReviewQueue action path", async () => {
    const pageModule = await import("@/app/(app)/harmony/approvals/page");
    const rendered = await pageModule.default();
    const json = JSON.stringify(rendered);
    expect(json).toContain("\"approvals\":[{\"approvalId\":\"approval_42\"");
    expect(json).toContain("approval_42");
  });
});

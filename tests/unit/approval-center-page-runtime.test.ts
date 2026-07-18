import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en-US"),
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("@/lib/auth/user", () => ({
  requireUser: vi.fn(async () => ({ id: "founder-1" })),
}));

vi.mock("@/lib/data/os/companies", () => ({
  listCompanies: vi.fn(async () => [{ id: "company-1", name: "AIOS" }]),
}));

vi.mock("@/lib/data/os/departments", () => ({
  listDepartments: vi.fn(async () => []),
}));

const listApprovalsUnified = vi.fn();
vi.mock("@/lib/data/os/approvals", () => ({
  listApprovalsUnified,
}));

const listPendingApprovalsForReview = vi.fn();
vi.mock("@/lib/harmony/autonomy/review-queue", () => ({
  listPendingApprovalsForReview,
}));

vi.mock("@/lib/harmony/os/approval-actions", () => ({
  decideApproval: vi.fn(async () => ({ ok: true })),
  deleteApproval: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/components/harmony/workforce/review-queue", () => ({
  ReviewQueue: ({ approvals }: { approvals?: Array<{ approvalId: string }> }) => ({
    type: "div",
    props: { "data-testid": "review-queue", children: approvals?.[0]?.approvalId ?? "none" },
  }),
}));

function flattenText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  if (typeof node === "object") {
    const maybeProps = (node as { props?: { children?: unknown } }).props;
    return flattenText(maybeProps?.children);
  }
  return "";
}

describe("Approval Center runtime safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders explicit operational error state when unified query fails (no global crash)", async () => {
    listApprovalsUnified.mockRejectedValueOnce(new Error("legacy_rls_denied"));
    listPendingApprovalsForReview.mockResolvedValueOnce([]);

    const pageModule = await import("@/app/(app)/harmony/approvals/page");
    const Page = pageModule.default;
    const tree = await Page();
    const text = flattenText(tree);

    expect(text.includes("Reference:")).toBe(true);
    expect(text.includes("legacy_rls_denied")).toBe(true);
  });

  it("does not crash when company name is missing for a row", async () => {
    listApprovalsUnified.mockResolvedValueOnce([
      {
        id: "spine_1",
        source: "spine",
        type: "task",
        title: "Spine item",
        summary: "Approval payload: ap_1",
        details: null,
        status: "pending",
        priority: "medium",
        requested_by: "mason",
        company_id: "company-unknown",
        department_id: null,
        message_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        decided_at: null,
      },
    ]);
    listPendingApprovalsForReview.mockResolvedValueOnce([
      {
        approvalId: "ap_1",
        agent: "mason",
        agentName: "Mason",
        label: "task",
        destructive: false,
      },
    ]);

    const pageModule = await import("@/app/(app)/harmony/approvals/page");
    const Page = pageModule.default;
    const tree = await Page();
    const text = flattenText(tree);

    expect(text.includes("company-unknown")).toBe(true);
  });

  it("renders spine row as temporarily unavailable when mapping is missing", async () => {
    listApprovalsUnified.mockResolvedValueOnce([
      {
        id: "spine_2",
        source: "spine",
        type: "task",
        title: "Spine item",
        summary: "Approval payload: ap_missing",
        details: null,
        status: "pending",
        priority: "medium",
        requested_by: "mason",
        company_id: "company-1",
        department_id: null,
        message_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        decided_at: null,
      },
    ]);
    listPendingApprovalsForReview.mockResolvedValueOnce([]);

    const pageModule = await import("@/app/(app)/harmony/approvals/page");
    const Page = pageModule.default;
    const tree = await Page();
    const text = flattenText(tree);

    expect(text.includes("Spine-managed")).toBe(true);
  });
});

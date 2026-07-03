import { describe, expect, it, vi } from "vitest";
import {
  isOversizedOperatorInput,
  deriveWorkTitle,
  saveOversizedInstructionAsWork,
} from "@/lib/harmony/operator-intake";
import { getPendingApprovalQueue } from "@/lib/harmony/autonomy/review-queue";
import { LIMITS } from "@/lib/limits";
import type { ApprovalPayload } from "@/lib/harmony/autonomy/types";

const SHORT = "Harmony, summarize today's standup.";
const LONG = "Do the following in detail:\n" + "x".repeat(LIMITS.operatorInput + 1);

describe("Operator input intake — long instruction handling", () => {
  it("short Harmony prompt is not oversized", () => {
    expect(isOversizedOperatorInput(SHORT)).toBe(false);
    expect(isOversizedOperatorInput("")).toBe(false);
  });

  it("long Harmony prompt is detected as oversized", () => {
    expect(isOversizedOperatorInput(LONG)).toBe(true);
  });

  it("derives a concise work-item title from the first real line", () => {
    expect(deriveWorkTitle("\n\n  Ship the launch checklist  \nmore detail")).toBe("Ship the launch checklist");
    expect(deriveWorkTitle("y".repeat(500)).length).toBe(200); // capped at LIMITS.title
    expect(deriveWorkTitle("   \n  ")).toBe("Founder instruction");
  });

  it("long prompt becomes a work item that stores the FULL text (no silent failure)", async () => {
    const createWorkItem = vi.fn(async () => ({ id: "wq_123" }));
    const result = await saveOversizedInstructionAsWork("user-1", LONG, {
      resolveCompanyId: async () => "company-1",
      createWorkItem,
    });

    expect(createWorkItem).toHaveBeenCalledTimes(1);
    expect(createWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        companyId: "company-1",
        agent: "harmony",
        detail: LONG, // full text preserved
        kind: "task",
      }),
    );
    expect(result.intent).toBe("execution_request");
    expect(result.reply).toContain("wq_123"); // accepted → shows work item ID
    expect(result.actionTaken).toEqual({ type: "work_delegated", label: "wq_123" });
  });

  it("never fails silently — surfaces an explicit reason when the work item can't be saved", async () => {
    const result = await saveOversizedInstructionAsWork("user-1", LONG, {
      resolveCompanyId: async () => null,
      createWorkItem: async () => null,
    });

    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.reply.toLowerCase()).toContain("nothing was dropped");
    expect(result.actionTaken).toBeUndefined();
  });

  it("approval item is visible in the Review Queue (blocked → approval item)", async () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const pending: ApprovalPayload = {
      approval_id: "approval_9",
      original_actor: "harmony",
      original_agent: "mason",
      original_domain: "engineering",
      original_action: "merge_pull_request",
      original_params: { objective: "Merge the release PR", repository: "AIOS-HQ/aios-platform" },
      required_context: {},
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    };

    const items = await getPendingApprovalQueue("user-1", "company-1", {
      listPendingApprovals: async () => [pending],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ approvalId: "approval_9", agent: "mason", action: "merge_pull_request" });
  });
});

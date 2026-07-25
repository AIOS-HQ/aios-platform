import { describe, expect, it, vi } from "vitest";
import { buildWorkItemApprovalPayload } from "@/lib/harmony/autonomy/work-approval";
import { resumeApprovedExecution, type ResumeDeps } from "@/lib/harmony/autonomy/execution-resumption";
import { getPendingApprovalQueue } from "@/lib/harmony/autonomy/review-queue";
import type { ExecutionResult } from "@/lib/harmony/autonomy/types";

const T0 = new Date("2026-07-04T00:00:00.000Z");

function recorder() {
  const calls: ExecutionResult[] = [];
  const fn: ResumeDeps["recordExecutionResult"] = async (_u, _c, result) => {
    calls.push(result);
    return result;
  };
  return { calls, fn };
}

describe("Work-item approval bridge (execution spine)", () => {
  it("builds a work-item approval payload carrying the work item id + title", () => {
    const p = buildWorkItemApprovalPayload({ id: "wi_1", title: "Publish Q3 report", companyId: "c1" }, T0);
    expect(p.approval_id.startsWith("approval_wi_")).toBe(true);
    expect(p.original_agent).toBe("harmony");
    expect(p.original_domain).toBe("operations");
    expect(p.original_params).toMatchObject({ workItemId: "wi_1", workItemTitle: "Publish Q3 report" });
    expect(new Date(p.expires_at).getTime()).toBeGreaterThan(new Date(p.created_at).getTime());
  });

  it("resume dispatches a work-item payload to executeWorkItem(force) and records completion", async () => {
    const rec = recorder();
    const runWorkItem = vi.fn(async () => "completed" as const);

    const outcome = await resumeApprovedExecution("user-1", "approval_wi_x", "c1", {
      getApprovedApprovalPayload: async () => buildWorkItemApprovalPayload({ id: "wi_9", title: "Ship it" }, T0),
      recordExecutionResult: rec.fn,
      runWorkItem,
      now: () => T0,
    });

    expect(runWorkItem).toHaveBeenCalledWith("user-1", "wi_9");
    expect(outcome.ok).toBe(true);
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.request_id).toBeUndefined();
    expect(rec.calls[0]?.correlation_id).toBeUndefined();
    expect(rec.calls[0]).toMatchObject({ status: "completed", required_approval: true });
  });

  it("preserves execution_id behavior when request/correlation ids are present", async () => {
    const rec = recorder();
    await rec.fn("user-1", "c1", {
      execution_id: "exec_work_1",
      request_id: "req_work_1",
      correlation_id: "corr_work_1",
      agent: "harmony",
      domain: "operations",
      action: "assign_work",
      status: "completed",
      required_approval: true,
      approval_id: "approval_wi_x",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.execution_id).toBe("exec_work_1");
    expect(rec.calls[0]?.request_id).toBe("req_work_1");
    expect(rec.calls[0]?.correlation_id).toBe("corr_work_1");
  });

  it("Review Queue label uses the work item title", async () => {
    const p = buildWorkItemApprovalPayload({ id: "wi_5", title: "Approve Q3 budget" }, T0);
    const items = await getPendingApprovalQueue("u", null, { listPendingApprovals: async () => [p] });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Approve Q3 budget");
  });

  it("resume blocks a work item whose execution does not complete", async () => {
    const rec = recorder();
    const outcome = await resumeApprovedExecution("user-1", "a", null, {
      getApprovedApprovalPayload: async () => buildWorkItemApprovalPayload({ id: "wi_2", title: "x" }, T0),
      recordExecutionResult: rec.fn,
      runWorkItem: async () => "blocked" as const,
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(rec.calls[0]).toMatchObject({ status: "blocked" });
  });
});

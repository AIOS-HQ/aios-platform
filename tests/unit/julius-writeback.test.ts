import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  recorded: [] as Record<string, unknown>[],
  failWrite: false,
}));

vi.mock("@/lib/julius/service", () => ({
  recordJuliusEntry: vi.fn(async (payload) => {
    if (state.failWrite) throw new Error("forced write failure");
    state.recorded.push(payload);
    return {
      id: `j-${state.recorded.length}`,
      user_id: String(payload.userId ?? payload.user_id ?? "user-1"),
      company_id: String(payload.companyId ?? payload.company_id ?? "company-1"),
      agent: String(payload.agent ?? "mason"),
      kind: payload.kind,
      title: payload.title,
      content: payload.content,
      refs: payload.refs ?? {},
      importance: payload.importance ?? 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }),
}));

describe("Julius verified write-back adapter", () => {
  beforeEach(async () => {
    state.recorded = [];
    state.failWrite = false;
    const { clearJuliusWritebackDedupeForTests } = await import("@/lib/julius/writeback");
    clearJuliusWritebackDedupeForTests();
  });

  function baseInput() {
    return {
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        causation_id: "cause-1",
        worker_id: "mason" as const,
        source_type: "mason_runtime" as const,
        source_id: "source-1",
        trace: { path: "runtime" },
      },
      category: "engineering_completion" as const,
      verification: "verified" as const,
      policy: { approved: true, requiresApproval: false, approvalId: null },
      outcome: { status: "completed" as const, summary: "done", details: null },
      source: { source_type: "mason_runtime" as const, source_id: "source-1" },
      trace: { execution: "exec-1" },
    };
  }

  it("writes verified completion", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const result = await writeVerifiedJuliusOutcome(baseInput());
    expect(result.status).toBe("written");
    expect(state.recorded).toHaveLength(1);
  });

  it("writes failure lesson", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.category = "failure_lesson";
    input.outcome = { status: "failed", summary: "failed", details: "details" };
    const result = await writeVerifiedJuliusOutcome(input);
    expect(result.status).toBe("written");
  });

  it("rejects unverified outcome", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.verification = "unverified";
    const result = await writeVerifiedJuliusOutcome(input);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("unverified_outcome");
  });

  it("rejects missing source", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.source.source_id = "";
    await expect(writeVerifiedJuliusOutcome(input)).rejects.toThrow("source_id_required");
  });

  it("rejects secret-like metadata", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.context.trace = { access_token: "secret" };
    await expect(writeVerifiedJuliusOutcome(input)).rejects.toThrow("secret_like_metadata_rejected");
  });

  it("rejects cross-company access", async () => {
    const { createJuliusInteractionContext, assertCompanyScope } = await import("@/lib/julius/interaction-context");
    const context = createJuliusInteractionContext({
      company_id: "company-1",
      user_id: "user-1",
      actor_id: "mason",
      execution_id: "exec-1",
      correlation_id: "corr-1",
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: "source-1",
      trace: {},
    });
    expect(() => assertCompanyScope(context, "company-2")).toThrow("cross_company_access_denied");
  });

  it("deduplicates same logical write replay", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    const first = await writeVerifiedJuliusOutcome(input);
    const second = await writeVerifiedJuliusOutcome(input);
    expect(first.status).toBe("written");
    expect(second.status).toBe("deduplicated");
  });

  it("rejects conflicting duplicate payload", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const first = await writeVerifiedJuliusOutcome(baseInput());
    expect(first.status).toBe("written");
    const input = baseInput();
    input.outcome.summary = "different";
    const second = await writeVerifiedJuliusOutcome(input);
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") expect(second.reason).toBe("conflicting_duplicate_payload");
  });

  it("rejects blocked result represented as completion", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.outcome.status = "blocked";
    const result = await writeVerifiedJuliusOutcome(input);
    expect(result.status).toBe("rejected");
  });


  it("includes execution/correlation trace for write outcomes", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.source.source_id = "source-3";
    const result = await writeVerifiedJuliusOutcome(input);

    expect(result.trace.company_id).toBe("company-1");
    expect(result.trace.execution_id).toBe("exec-1");
    expect(result.trace.correlation_id).toBe("corr-1");
    expect(result.trace.causation_id).toBe("cause-1");
    expect(result.trace.worker_id).toBe("mason");
    expect(result.trace.source_id).toBe("source-3");
  });

  it("exposes policy denial trace for approval pending", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    const input = baseInput();
    input.category = "engineering_decision";
    input.policy = { approved: false, requiresApproval: true, approvalId: "ap-1" };
    input.source.source_id = "source-approval";
    input.outcome.summary = "decision pending approval";

    const result = await writeVerifiedJuliusOutcome(input);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBe("approval_required");
      expect(result.trace.reason).toBe("approval_required");
      expect(result.trace.policy.requiresApproval).toBe(true);
      expect(result.trace.policy.approvalId).toBe("ap-1");
    }
  });

  it("returns failed when julius write fails", async () => {
    const { writeVerifiedJuliusOutcome } = await import("@/lib/julius/writeback");
    state.failWrite = true;
    const input = baseInput();
    input.source.source_id = "source-fail";
    const result = await writeVerifiedJuliusOutcome(input);
    expect(result.status).toBe("failed");
  });
});

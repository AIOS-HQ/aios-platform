import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  failWith: null as string | null,
}));

vi.mock("@/lib/julius/service", () => ({
  getJuliusContext: vi.fn(async () => {
    if (state.failWith) throw new Error(state.failWith);
    return state.entries;
  }),
}));

describe("Julius interaction context + Mason retrieval adapter", () => {
  beforeEach(() => {
    state.entries = [];
    state.failWith = null;
  });

  it("accepts a valid interaction context", async () => {
    const { createJuliusInteractionContext } = await import("@/lib/julius/interaction-context");

    const context = createJuliusInteractionContext({
      company_id: "company-1",
      user_id: "user-1",
      actor_id: "mason",
      execution_id: "exec-1",
      correlation_id: "corr-1",
      causation_id: "cause-1",
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: "source-1",
      trace: { path: "test" },
    });

    expect(context.company_id).toBe("company-1");
    expect(context.execution_id).toBe("exec-1");
  });

  it("rejects missing company", async () => {
    const { createJuliusInteractionContext } = await import("@/lib/julius/interaction-context");
    expect(() =>
      createJuliusInteractionContext({
        company_id: "",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      }),
    ).toThrow("company_id_required");
  });

  it("rejects missing execution", async () => {
    const { createJuliusInteractionContext } = await import("@/lib/julius/interaction-context");
    expect(() =>
      createJuliusInteractionContext({
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      }),
    ).toThrow("execution_id_required");
  });

  it("rejects invalid worker", async () => {
    const { createJuliusInteractionContext } = await import("@/lib/julius/interaction-context");
    expect(() =>
      createJuliusInteractionContext({
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "hacker" as never,
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      }),
    ).toThrow("invalid_worker_id");
  });

  it("rejects secret-like metadata", async () => {
    const { createJuliusInteractionContext } = await import("@/lib/julius/interaction-context");
    expect(() =>
      createJuliusInteractionContext({
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: { api_token: "x" },
      }),
    ).toThrow("secret_like_metadata_rejected");
  });

  it("denies cross-company access", async () => {
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

  it("returns found retrieval result with linkage", async () => {
    state.entries = [{ id: "julius-1", title: "Prior decision" }];
    const { retrieveMasonExecutionContext } = await import("@/lib/julius/mason-retrieval");
    const result = await retrieveMasonExecutionContext({
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-123",
        correlation_id: "corr-123",
        causation_id: "cause-123",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: { path: "worker" },
      },
      engineeringQuery: "fix deployment rollback",
    });

    expect(result.status).toBe("found");
    expect(result.context.execution_id).toBe("exec-123");
    expect(result.context.correlation_id).toBe("corr-123");
    expect(result.entries).toHaveLength(1);
  });

  it("returns empty when retrieval has no entries", async () => {
    state.entries = [];
    const { retrieveMasonExecutionContext } = await import("@/lib/julius/mason-retrieval");
    const result = await retrieveMasonExecutionContext({
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      },
      engineeringQuery: "new query",
    });
    expect(result.status).toBe("empty");
    expect(result.entries).toEqual([]);
  });

  it("returns degraded on migration/rpc style retrieval failure", async () => {
    state.failWith = "relation julius_entries does not exist";
    const { retrieveMasonExecutionContext } = await import("@/lib/julius/mason-retrieval");
    const result = await retrieveMasonExecutionContext({
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      },
      engineeringQuery: "any",
    });
    expect(result.status).toBe("degraded");
    expect(result.degraded).toBe(true);
  });

  it("returns failed on non-degraded retrieval failure", async () => {
    state.failWith = "permission denied";
    const { retrieveMasonExecutionContext } = await import("@/lib/julius/mason-retrieval");
    const result = await retrieveMasonExecutionContext({
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      },
      engineeringQuery: "any",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("permission denied");
  });

  it("does not fabricate context when query is missing", async () => {
    const { retrieveMasonExecutionContext } = await import("@/lib/julius/mason-retrieval");
    const result = await retrieveMasonExecutionContext({
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source-1",
        trace: {},
      },
      engineeringQuery: "",
    });
    expect(result.status).toBe("failed");
    expect(result.entries).toEqual([]);
    expect(result.error).toBe("engineering_query_required");
  });
});

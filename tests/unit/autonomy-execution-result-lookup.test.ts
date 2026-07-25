import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

type QueryState = {
  where: Record<string, unknown>;
  selected: string | null;
  table: string | null;
};

function buildSupabaseStub(result: { data: unknown; error: { message: string } | null }, state: QueryState) {
  const chain = {
    from: vi.fn((table: string) => {
      state.table = table;
      return chain;
    }),
    select: vi.fn((selected: string) => {
      state.selected = selected;
      return chain;
    }),
    eq: vi.fn((key: string, value: unknown) => {
      state.where[key] = value;
      return chain;
    }),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

const BASE = {
  execution_id: "exec-1",
  request_id: "req-1",
  correlation_id: "corr-1",
  agent: "mason",
  domain: "engineering",
  action: "open_pull_request",
  status: "completed",
  required_approval: true,
  approval_id: "approval-1",
  created_at: "2026-07-01T00:00:00.000Z",
  expires_at: "2026-10-01T00:00:00.000Z",
  emitted_to: ["activity_feed", "review_queue"],
};

describe("execution result lookup helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up by execution_id scoped to user/company", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: { ...BASE }, error: null }, state));

    const { findExecutionResultByExecutionId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByExecutionId("user-1", "company-1", "exec-1");

    expect(found).toEqual({ ...BASE });
    expect(state.table).toBe("execution_results");
    expect(state.selected).toBe("*");
    expect(state.where).toMatchObject({
      user_id: "user-1",
      company_id: "company-1",
      execution_id: "exec-1",
    });
  });

  it("looks up by request_id scoped to user/company", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: { ...BASE, execution_id: "exec-2" }, error: null }, state));

    const { findExecutionResultByRequestId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByRequestId("user-1", "company-1", "req-1");

    expect(found).toEqual({ ...BASE, execution_id: "exec-2" });
    expect(state.where).toMatchObject({
      user_id: "user-1",
      company_id: "company-1",
      request_id: "req-1",
    });
  });

  it("looks up by correlation_id scoped to user/company", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: { ...BASE, execution_id: "exec-3" }, error: null }, state));

    const { findExecutionResultByCorrelationId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByCorrelationId("user-1", "company-1", "corr-1");

    expect(found).toEqual({ ...BASE, execution_id: "exec-3" });
    expect(state.where).toMatchObject({
      user_id: "user-1",
      company_id: "company-1",
      correlation_id: "corr-1",
    });
  });

  it("returns null when no match", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: null, error: null }, state));

    const { findExecutionResultByRequestId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByRequestId("user-1", "company-1", "missing");

    expect(found).toBeNull();
  });

  it("keeps user/company isolation filters", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: null, error: null }, state));

    const { findExecutionResultByExecutionId } = await import("@/lib/harmony/autonomy/data-access");
    await findExecutionResultByExecutionId("user-isolated", "company-isolated", "exec-shared");

    expect(state.where.user_id).toBe("user-isolated");
    expect(state.where.company_id).toBe("company-isolated");
    expect(state.where.execution_id).toBe("exec-shared");
  });

  it("fails closed when identity is missing", async () => {
    const state: QueryState = { where: {}, selected: null, table: null };
    const stub = buildSupabaseStub({ data: { ...BASE }, error: null }, state);
    createClient.mockResolvedValue(stub);

    const { findExecutionResultByCorrelationId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByCorrelationId("user-1", "company-1", "   ");

    expect(found).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("returns persisted execution result unchanged", async () => {
    const persisted = {
      ...BASE,
      result_data: { summary: "ok", nested: { pr: 123 } },
      error: null,
    };
    const state: QueryState = { where: {}, selected: null, table: null };
    createClient.mockResolvedValue(buildSupabaseStub({ data: persisted, error: null }, state));

    const { findExecutionResultByExecutionId } = await import("@/lib/harmony/autonomy/data-access");
    const found = await findExecutionResultByExecutionId("user-1", "company-1", "exec-1");

    expect(found).toEqual(persisted);
  });
});

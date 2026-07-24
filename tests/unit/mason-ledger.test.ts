import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const createClientMock = vi.fn(async () => ({ from: fromMock }));
  return { fromMock, createClientMock };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClientMock,
}));

import {
  appendMasonLedgerEvent,
  createMasonExecutionId,
  listMasonExecutionTimeline,
  getMasonLatestExecutionState,
  listMasonCompanyHistory,
} from "@/lib/harmony/code/mason-ledger";

function fakeRow(overrides?: Record<string, unknown>) {
  return {
    id: "evt-1",
    execution_id: "exec-1",
    user_id: "user-1",
    company_id: "company-1",
    agent: "mason",
    event_type: "execution_started",
    runtime_state: "executing",
    operation_type: "runtime",
    connector_id: null,
    target_resource: null,
    approval_id: null,
    pull_request_number: null,
    pull_request_url: null,
    preview_url: null,
    validation_ref: null,
    rollback_ref: null,
    result_status: "ok",
    failure_classification: null,
    summary: "ok",
    metadata: {},
    idempotency_key: "k1",
    created_at: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.fromMock.mockReset();
  mocks.createClientMock.mockClear();
});

describe("Mason ledger", () => {
  it("creates stable execution ids with scope inputs", () => {
    const id = createMasonExecutionId({
      userId: "user-12345678",
      companyId: "company-abc",
      repository: "AIOS-HQ/aios-platform",
      objective: "Fix runtime policy bridge",
      branch: "mason/fix-bridge",
    });

    expect(id.startsWith("mason:")).toBe(true);
    expect(id).toContain("aios-hq/aios-platform");
    expect(id).toContain("mason/fix-bridge");
  });

  it("persists event append and keeps only allowlisted safe metadata", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: fakeRow(), error: null })),
      })),
    }));

    mocks.fromMock.mockReturnValue({ insert });

    const saved = await appendMasonLedgerEvent({
      executionId: "exec-1",
      userId: "user-1",
      companyId: "company-1",
      eventType: "execution_started",
      resultStatus: "ok",
      summary: "start",
      idempotencyKey: "k1",
      metadata: { token: "secret", nested: { apiKey: "hidden", safe: "ok" }, correlationId: "corr-1" },
    });

    expect(saved?.id).toBe("evt-1");
    const payload = insert.mock.calls[0]?.[0]?.metadata;
    expect(payload.token).toBeUndefined();
    expect(payload.nested).toBeUndefined();
    expect(payload.correlationId).toBe("corr-1");
  });

  it("is idempotent when idempotency key already exists", async () => {
    mocks.fromMock
      .mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: { code: "23505", message: "dup" } })),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: fakeRow({ id: "evt-existing" }), error: null })),
          })),
        })),
      });

    const saved = await appendMasonLedgerEvent({
      executionId: "exec-1",
      userId: "user-1",
      companyId: "company-1",
      eventType: "execution_started",
      resultStatus: "ok",
      summary: "start",
      idempotencyKey: "k-dup",
    });

    expect(saved?.id).toBe("evt-existing");
  });

  it("retrieves timeline, latest state, and company history scoped by user/company", async () => {
    mocks.fromMock
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: [fakeRow({ id: "evt-a" })], error: null })),
              })),
            })),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: fakeRow({ id: "evt-latest" }), error: null })) })),
                })),
              })),
            })),
          })),
        })),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [fakeRow({ id: "evt-h1" }), fakeRow({ id: "evt-h2" })], error: null })),
              })),
            })),
          })),
        })),
      });

    const timeline = await listMasonExecutionTimeline({ userId: "user-1", companyId: "company-1", executionId: "exec-1" });
    const latest = await getMasonLatestExecutionState({ userId: "user-1", companyId: "company-1", executionId: "exec-1" });
    const history = await listMasonCompanyHistory({ userId: "user-1", companyId: "company-1", limit: 10 });

    expect(timeline).toHaveLength(1);
    expect(latest?.id).toBe("evt-latest");
    expect(history).toHaveLength(2);
  });

  it("preserves safe validation metadata and strips sensitive keys", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: fakeRow(), error: null })),
      })),
    }));

    mocks.fromMock.mockReturnValue({ insert });

    await appendMasonLedgerEvent({
      executionId: "exec-1",
      userId: "user-1",
      companyId: "company-1",
      eventType: "validation_started",
      resultStatus: "blocked",
      summary: "validation_running",
      idempotencyKey: "validation-safe-k1",
      metadata: {
        validationLifecycle: { state: "running", terminalState: null },
        observedCheckClassifications: [{ name: "lint", status: "pending" }],
        validationState: "running",
        requiredValidationIds: ["lint"],
        safeEvidenceRefs: ["wf-1", "check-1"],
        token: "redact-me",
        authorization: "redact-me",
      },
    });

    const payload = insert.mock.calls[0]?.[0]?.metadata;
    expect(payload.validationLifecycle).toBeDefined();
    expect(payload.observedCheckClassifications).toBeDefined();
    expect(payload.validationState).toBe("running");
    expect(payload.safeEvidenceRefs).toEqual(["wf-1", "check-1"]);
    expect(payload.token).toBeUndefined();
    expect(payload.authorization).toBeUndefined();
  });
});

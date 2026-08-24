import { describe, expect, it, vi } from "vitest";

import {
  PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
  runPromotionPersistenceReadOnlyDiagnosticWithClient,
} from "@/lib/promotion/approval-evidence-shared";

type Result = { data: unknown | null; error: unknown | null };

function createReadOnlyClient(results: Result[]) {
  const methods = {
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    rpc: vi.fn(),
  };

  let index = 0;
  const eqCalls: Array<{ column: string; value: string }> = [];
  const from = vi.fn(() => {
    const selected = {
      select: vi.fn(() => selected),
      eq: vi.fn((column: string, value: string) => {
        eqCalls.push({ column, value });
        return selected;
      }),
      maybeSingle: vi.fn(async () => results[index++]),
    };

    return {
      ...selected,
      ...methods,
    };
  });

  return {
    client: { from } as unknown as { from: (table: string) => unknown },
    from,
    methods,
    eqCalls,
  };
}

describe("promotion persistence read-only diagnostic", () => {
  it("uses only select/read operations and returns expected diagnostics", async () => {
    const { client, from, methods, eqCalls } = createReadOnlyClient([
      {
        data: {
          promotion_request_id: PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
          runtime_evidence_id: null,
          runtime_artifact_id: null,
          preview_certification_waiver: true,
          preview_certification_waiver_reason: "preview_certification_contract_incompatibility",
        },
        error: null,
      },
      { data: { decision_source: "founder" }, error: null },
      { data: { decision_source: "harmony" }, error: null },
    ]);

    const result = await runPromotionPersistenceReadOnlyDiagnosticWithClient(client as never);

    expect(from).toHaveBeenCalledTimes(3);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { column: "promotion_request_id", value: PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID },
        { column: "decision_source", value: "founder" },
        { column: "decision_source", value: "harmony" },
      ]),
    );
    expect(result).toMatchObject({
      requestId: PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
      adminReadAccess: true,
      productionPromotionRequestsQueryable: true,
      productionPromotionDecisionsQueryable: true,
      previewWaiverFieldsQueryable: true,
      waiverRuntimePathSupported: true,
      requestExists: true,
      founderDecisionExists: true,
      harmonyDecisionExists: true,
    });

    expect(methods.insert).not.toHaveBeenCalled();
    expect(methods.update).not.toHaveBeenCalled();
    expect(methods.upsert).not.toHaveBeenCalled();
    expect(methods.delete).not.toHaveBeenCalled();
    expect(methods.rpc).not.toHaveBeenCalled();
  });

  it("reports missing request and decisions without mutating", async () => {
    const { client, methods } = createReadOnlyClient([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await runPromotionPersistenceReadOnlyDiagnosticWithClient(client as never);

    expect(result.requestExists).toBe(false);
    expect(result.founderDecisionExists).toBe(false);
    expect(result.harmonyDecisionExists).toBe(false);
    expect(result.waiverRuntimePathSupported).toBe(false);

    expect(methods.insert).not.toHaveBeenCalled();
    expect(methods.update).not.toHaveBeenCalled();
    expect(methods.upsert).not.toHaveBeenCalled();
    expect(methods.delete).not.toHaveBeenCalled();
    expect(methods.rpc).not.toHaveBeenCalled();
  });

  it("supports non-waiver runtime evidence path", async () => {
    const { client } = createReadOnlyClient([
      {
        data: {
          promotion_request_id: PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
          runtime_evidence_id: "runtime-evidence-1",
          runtime_artifact_id: "github-artifact:11111",
          preview_certification_waiver: false,
          preview_certification_waiver_reason: null,
        },
        error: null,
      },
      { data: { decision_source: "founder" }, error: null },
      { data: { decision_source: "harmony" }, error: null },
    ]);

    const result = await runPromotionPersistenceReadOnlyDiagnosticWithClient(client as never);
    expect(result.waiverRuntimePathSupported).toBe(true);
  });
});

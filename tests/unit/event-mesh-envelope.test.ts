import { describe, expect, it } from "vitest";
import {
  AIOS_EVENT_MAX_BYTES,
  EventEnvelopeValidationError,
  createAiosEventEnvelope,
  deterministicIdempotencyKey,
  validateAiosEventEnvelope,
} from "@/lib/event-mesh/envelope";

describe("AIOS event envelope", () => {
  it("creates and validates a versioned workforce envelope", () => {
    const event = createAiosEventEnvelope({
      eventType: "workforce.task.created",
      companyId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      sourceAgent: "harmony",
      targetAgent: "auditor",
      taskRef: { type: "agent_message", id: "message-1" },
      payload: { subject: "Inspect readiness" },
    });

    expect(validateAiosEventEnvelope(event)).toMatchObject({
      eventType: "workforce.task.created",
      eventVersion: 1,
      contentType: "application/vnd.aios.event+json",
      companyId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects unsupported versions, missing company scope, large payloads, and secret-shaped keys", () => {
    const event = createAiosEventEnvelope({
      eventType: "workforce.task.created",
      companyId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      taskRef: { type: "agent_message", id: "message-1" },
    });

    expect(() => validateAiosEventEnvelope({ ...event, eventVersion: 2 })).toThrow(EventEnvelopeValidationError);
    expect(() => validateAiosEventEnvelope({ ...event, companyId: null })).toThrow("companyId is required");
    expect(() => createAiosEventEnvelope({
      eventType: "system.health.changed",
      payload: { access_token: "not-allowed" },
    })).toThrow("Unsafe secret-bearing key");
    expect(() => createAiosEventEnvelope({
      eventType: "system.health.changed",
      payload: { blob: "x".repeat(AIOS_EVENT_MAX_BYTES) },
    })).toThrow("exceeds");
  });

  it("builds deterministic idempotency keys independent of object key ordering", () => {
    const a = deterministicIdempotencyKey({
      eventType: "connector.execution.requested",
      companyId: "company",
      payload: { b: 2, a: 1 },
    });
    const b = deterministicIdempotencyKey({
      eventType: "connector.execution.requested",
      companyId: "company",
      payload: { a: 1, b: 2 },
    });

    expect(a).toBe(b);
  });
});

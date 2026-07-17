import { describe, expect, it } from "vitest";
import {
  createCanonicalWorkforceEnvelope,
  readCanonicalWorkforceEnvelope,
  transitionCanonicalWorkforceEnvelope,
} from "@/lib/harmony/agents/a2a";

describe("A2A canonical workforce envelope", () => {
  it("creates a delegated envelope with deterministic fallback correlation", () => {
    const envelope = createCanonicalWorkforceEnvelope({
      messageId: "message-1",
      userId: "user-1",
      companyId: "company-1",
      fromAgent: "harmony",
      toAgent: "auditor",
      kind: "task",
      risk: "routine",
      approvalRequired: false,
    });

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.execution.status).toBe("delegated");
    expect(envelope.trace.correlationId).toBe("message-1");
    expect(envelope.policy.companyScopeEnforced).toBe(true);
  });

  it("tracks lifecycle transitions for ack, timeout, and dead-letter", () => {
    const base = createCanonicalWorkforceEnvelope({
      messageId: "message-2",
      userId: "user-1",
      companyId: "company-1",
      fromAgent: "harmony",
      toAgent: "mason",
      kind: "task",
      risk: "approval",
      approvalRequired: true,
      parentId: "parent-1",
    });

    const acked = transitionCanonicalWorkforceEnvelope(base, "acknowledged");
    const timedOut = transitionCanonicalWorkforceEnvelope(acked, "timed_out", { reason: "worker_timeout" });
    const dead = transitionCanonicalWorkforceEnvelope(timedOut, "dead_lettered", { reason: "max_attempts_reached" });

    expect(acked.delivery.ackReceived).toBe(true);
    expect(acked.execution.acknowledgedAt).toBeTruthy();
    expect(timedOut.delivery.timeoutReason).toBe("worker_timeout");
    expect(dead.delivery.deadLetterReason).toBe("max_attempts_reached");
    expect(dead.delivery.retryEligible).toBe(false);
    expect(dead.execution.status).toBe("dead_lettered");
  });

  it("reads envelope content from message context", () => {
    const envelope = createCanonicalWorkforceEnvelope({
      messageId: "message-3",
      userId: "user-1",
      companyId: "company-1",
      fromAgent: "harmony",
      toAgent: "atlas",
      kind: "message",
      risk: "routine",
      approvalRequired: false,
    });

    const loaded = readCanonicalWorkforceEnvelope({ context: { envelope } });
    expect(loaded?.envelopeId).toBe("message-3");
    expect(loaded?.actor.toAgent).toBe("atlas");
  });
});

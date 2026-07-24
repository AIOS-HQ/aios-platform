import "server-only";

import { randomUUID } from "node:crypto";
import { createMasonExecutionId } from "@/lib/harmony/code/mason-ledger";

export type MasonExecutionSource =
  | "founder_session"
  | "approved_payload"
  | "harmony"
  | "event_mesh";

export interface MasonExecutionIdentity {
  executionId: string;
  correlationId: string;
  causationId: string | null;
  userId: string;
  companyId: string;
  actorId: string;
  source: MasonExecutionSource;
}

export function createMasonExecutionIdentity(input: {
  userId: string;
  companyId: string;
  actorId: string;
  source: MasonExecutionSource;
  repository: string;
  objective: string;
  branch?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
}): MasonExecutionIdentity {
  const correlationId = input.correlationId?.trim() || `mason-correlation-${randomUUID()}`;
  const baseExecutionId = createMasonExecutionId({
    userId: input.userId,
    companyId: input.companyId,
    repository: input.repository,
    objective: input.objective,
    branch: input.branch,
  });
  const executionSuffix = correlationId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(-36);

  return Object.freeze({
    executionId: `${baseExecutionId}:${executionSuffix}`,
    correlationId,
    causationId: input.causationId?.trim() || null,
    userId: input.userId,
    companyId: input.companyId,
    actorId: input.actorId,
    source: input.source,
  });
}

export function assertMasonExecutionIdentity(
  identity: MasonExecutionIdentity,
  expected: { userId: string; companyId: string },
): void {
  if (!identity.executionId || !identity.correlationId) {
    throw new Error("mason_execution_identity_incomplete");
  }
  if (identity.userId !== expected.userId || identity.companyId !== expected.companyId) {
    throw new Error("mason_execution_identity_scope_mismatch");
  }
}

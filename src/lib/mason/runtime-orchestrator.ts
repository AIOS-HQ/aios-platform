import "server-only";

export type MasonRuntimeState =
  | "PENDING"
  | "VALIDATING"
  | "WAITING_FOR_APPROVAL"
  | "READY"
  | "EXECUTING"
  | "CAPTURING_EVIDENCE"
  | "RECORDING_LEDGER"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK";

export interface MasonRuntimeEvent {
  executionId: string;
  requestId: string;
  state: MasonRuntimeState;
  at: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface MasonExecutionContext {
  executionId: string;
  requestId: string;
  requestSource: string;
  actor: string;
  agent: string;
  capability: string;
  approvalState: "approved" | "required" | "missing";
  governanceState: "allowed" | "rejected";
  connectorState: "healthy" | "unavailable";
  credentialState: "valid" | "invalid";
  runtimeState: MasonRuntimeState;
  executionPlan: string[];
  evidence: Array<Record<string, unknown>>;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  };
}

export interface MasonExecutionRequest {
  requestId: string;
  requestSource: string;
  actor: string;
  agent: string;
  capability: string;
  requiresApproval: boolean;
  approved: boolean;
}

export interface MasonOrchestratorDependencies {
  resolveCapability: (agent: string, capability: string) => Promise<boolean>;
  checkRuntimeHealth: () => Promise<boolean>;
  checkConnectorHealth: (capability: string) => Promise<boolean>;
  checkCredentials: (capability: string) => Promise<boolean>;
  checkGovernance: (request: MasonExecutionRequest) => Promise<boolean>;
  generatePlan: (request: MasonExecutionRequest) => Promise<string[]>;
  executePlan: (context: MasonExecutionContext) => Promise<Record<string, unknown>>;
  captureEvidence: (context: MasonExecutionContext, executionResult: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateLedger: (context: MasonExecutionContext) => Promise<void>;
  publishCompletion: (event: MasonRuntimeEvent) => Promise<void>;
  rollback?: (context: MasonExecutionContext) => Promise<void>;
  now?: () => Date;
  createExecutionId?: () => string;
}

function toIso(now: Date): string {
  return now.toISOString();
}

function createTransition(
  context: MasonExecutionContext,
  state: MasonRuntimeState,
  message: string,
  metadata?: Record<string, unknown>,
): MasonRuntimeEvent {
  return {
    executionId: context.executionId,
    requestId: context.requestId,
    state,
    at: context.timestamps.updatedAt,
    message,
    metadata,
  };
}

function withState(
  context: MasonExecutionContext,
  state: MasonRuntimeState,
  now: Date,
): MasonExecutionContext {
  return {
    ...context,
    runtimeState: state,
    timestamps: {
      ...context.timestamps,
      updatedAt: toIso(now),
      completedAt: state === "COMPLETED" || state === "FAILED" || state === "ROLLED_BACK"
        ? toIso(now)
        : context.timestamps.completedAt,
    },
  };
}

export async function runMasonRuntimeOrchestrator(
  request: MasonExecutionRequest,
  dependencies: MasonOrchestratorDependencies,
): Promise<{ context: MasonExecutionContext; events: MasonRuntimeEvent[] }> {
  const now = dependencies.now ?? (() => new Date());
  const executionId = dependencies.createExecutionId?.() ?? `exec-${request.requestId}`;
  let context: MasonExecutionContext = {
    executionId,
    requestId: request.requestId,
    requestSource: request.requestSource,
    actor: request.actor,
    agent: request.agent,
    capability: request.capability,
    approvalState: request.requiresApproval ? (request.approved ? "approved" : "required") : "approved",
    governanceState: "allowed",
    connectorState: "healthy",
    credentialState: "valid",
    runtimeState: "PENDING",
    executionPlan: [],
    evidence: [],
    timestamps: {
      createdAt: toIso(now()),
      updatedAt: toIso(now()),
      completedAt: null,
    },
  };

  const events: MasonRuntimeEvent[] = [createTransition(context, "PENDING", "Execution request received")];

  const transition = (state: MasonRuntimeState, message: string, metadata?: Record<string, unknown>) => {
    context = withState(context, state, now());
    events.push(createTransition(context, state, message, metadata));
  };

  transition("VALIDATING", "Starting validation pipeline");

  const capabilityExists = await dependencies.resolveCapability(request.agent, request.capability);
  if (!capabilityExists) {
    transition("FAILED", "Capability not found", { reason: "missing_capability" });
    return { context, events };
  }

  const runtimeHealthy = await dependencies.checkRuntimeHealth();
  if (!runtimeHealthy) {
    transition("FAILED", "Runtime unavailable", { reason: "runtime_unavailable" });
    return { context, events };
  }

  const connectorHealthy = await dependencies.checkConnectorHealth(request.capability);
  if (!connectorHealthy) {
    context = { ...context, connectorState: "unavailable" };
    transition("FAILED", "Connector unavailable", { reason: "connector_unavailable" });
    return { context, events };
  }

  const credentialsValid = await dependencies.checkCredentials(request.capability);
  if (!credentialsValid) {
    context = { ...context, credentialState: "invalid" };
    transition("FAILED", "Credential verification failed", { reason: "credential_failure" });
    return { context, events };
  }

  const governanceAllowed = await dependencies.checkGovernance(request);
  if (!governanceAllowed) {
    context = { ...context, governanceState: "rejected" };
    transition("FAILED", "Governance rejected execution", { reason: "governance_rejection" });
    return { context, events };
  }

  if (request.requiresApproval && !request.approved) {
    context = { ...context, approvalState: "missing" };
    transition("WAITING_FOR_APPROVAL", "Founder approval required", { reason: "approval_required" });
    return { context, events };
  }

  transition("READY", "Validation complete; execution ready");

  context = {
    ...context,
    executionPlan: await dependencies.generatePlan(request),
  };

  transition("EXECUTING", "Executing runtime plan", { steps: context.executionPlan.length });

  try {
    const result = await dependencies.executePlan(context);

    transition("CAPTURING_EVIDENCE", "Capturing execution evidence");
    const evidence = await dependencies.captureEvidence(context, result);
    context = {
      ...context,
      evidence: [...context.evidence, evidence],
    };

    transition("RECORDING_LEDGER", "Recording execution outcome to ledger");
    await dependencies.updateLedger(context);

    transition("COMPLETED", "Execution completed successfully");
    await dependencies.publishCompletion(events[events.length - 1]);
    return { context, events };
  } catch (error) {
    transition("FAILED", "Execution failed", {
      reason: "execution_failure",
      error: error instanceof Error ? error.message : String(error),
    });
    if (dependencies.rollback) {
      await dependencies.rollback(context);
      transition("ROLLED_BACK", "Rollback completed");
    }
    return { context, events };
  }
}


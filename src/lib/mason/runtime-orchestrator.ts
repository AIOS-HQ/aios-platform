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
  correlationId: string;
  previousState: MasonRuntimeState | null;
  nextState: MasonRuntimeState;
  reason: string;
  actor: string;
  agent: string;
  capability: string;
  timestamp: string;
  result: "success" | "failure" | "waiting" | "retrying";
}

export interface MasonStructuredEvidenceRecord {
  evidenceId: string;
  source: string;
  evidenceType: string;
  confidence: number;
  verificationStatus: "verified" | "unverified" | "pending";
  immutableReference: string;
  capturedAt: string;
}

export interface MasonExecutionPlan {
  planId: string;
  intent: string;
  capability: string;
  requestedAction: string;
  preconditions: string[];
  governanceChecks: string[];
  approvalChecks: string[];
  connectorRequirements: string[];
  credentialRequirements: string[];
  executionSteps: string[];
  rollbackPlan: string[];
  successCriteria: string[];
  evidenceRequirements: string[];
  generatedAt: string;
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
  executionPlan: MasonExecutionPlan | null;
  evidence: MasonStructuredEvidenceRecord[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  };
}

export interface MasonRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  retryableReasons: Array<
    "connector_timeout" | "runtime_temporarily_unavailable" | "network_interruption" | "rate_limited"
  >;
}

const DEFAULT_RETRY_POLICY: MasonRetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 10,
  retryableReasons: [
    "connector_timeout",
    "runtime_temporarily_unavailable",
    "network_interruption",
    "rate_limited",
  ],
};

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
  generatePlan: (request: MasonExecutionRequest) => Promise<MasonExecutionPlan>;
  executePlan: (context: MasonExecutionContext, plan: MasonExecutionPlan) => Promise<Record<string, unknown>>;
  captureEvidence: (
    context: MasonExecutionContext,
    executionResult: Record<string, unknown>,
  ) => Promise<MasonStructuredEvidenceRecord[]>;
  updateLedger: (context: MasonExecutionContext) => Promise<void>;
  publishCompletion: (event: MasonRuntimeEvent) => Promise<void>;
  rollback?: (context: MasonExecutionContext) => Promise<void>;
  retryPolicy?: MasonRetryPolicy;
  now?: () => Date;
  createExecutionId?: () => string;
}

function toIso(now: Date): string {
  return now.toISOString();
}

function createTransition(
  context: MasonExecutionContext,
  previousState: MasonRuntimeState | null,
  nextState: MasonRuntimeState,
  reason: string,
  result: "success" | "failure" | "waiting" | "retrying",
): MasonRuntimeEvent {
  return {
    executionId: context.executionId,
    correlationId: context.requestId,
    previousState,
    nextState,
    reason,
    actor: context.actor,
    agent: context.agent,
    capability: context.capability,
    timestamp: context.timestamps.updatedAt,
    result,
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
  const retryPolicy = dependencies.retryPolicy ?? DEFAULT_RETRY_POLICY;
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
    executionPlan: null,
    evidence: [],
    timestamps: {
      createdAt: toIso(now()),
      updatedAt: toIso(now()),
      completedAt: null,
    },
  };

  const events: MasonRuntimeEvent[] = [createTransition(context, null, "PENDING", "execution_request_received", "success")];

  const transition = (
    state: MasonRuntimeState,
    reason: string,
    result: "success" | "failure" | "waiting" | "retrying" = "success",
  ) => {
    const previousState = context.runtimeState;
    context = withState(context, state, now());
    events.push(createTransition(context, previousState, state, reason, result));
  };

  transition("VALIDATING", "validation_started");

  const capabilityExists = await dependencies.resolveCapability(request.agent, request.capability);
  if (!capabilityExists) {
    transition("FAILED", "missing_capability", "failure");
    return { context, events };
  }

  const runtimeHealthy = await dependencies.checkRuntimeHealth();
  if (!runtimeHealthy) {
    transition("FAILED", "runtime_unavailable", "failure");
    return { context, events };
  }

  const connectorHealthy = await dependencies.checkConnectorHealth(request.capability);
  if (!connectorHealthy) {
    context = { ...context, connectorState: "unavailable" };
    transition("FAILED", "connector_unavailable", "failure");
    return { context, events };
  }

  const credentialsValid = await dependencies.checkCredentials(request.capability);
  if (!credentialsValid) {
    context = { ...context, credentialState: "invalid" };
    transition("FAILED", "credential_failure", "failure");
    return { context, events };
  }

  const governanceAllowed = await dependencies.checkGovernance(request);
  if (!governanceAllowed) {
    context = { ...context, governanceState: "rejected" };
    transition("FAILED", "governance_rejection", "failure");
    return { context, events };
  }

  if (request.requiresApproval && !request.approved) {
    context = { ...context, approvalState: "missing" };
    transition("WAITING_FOR_APPROVAL", "approval_required", "waiting");
    return { context, events };
  }

  transition("READY", "validation_complete");

  context = {
    ...context,
    executionPlan: await dependencies.generatePlan(request),
  };

  transition("EXECUTING", "execution_started");

  try {
    const plan = context.executionPlan;
    if (!plan) {
      transition("FAILED", "execution_plan_missing", "failure");
      return { context, events };
    }
    let attempt = 0;
    let result: Record<string, unknown>;
    while (true) {
      try {
        result = await dependencies.executePlan(context, plan);
        break;
      } catch (error) {
        attempt += 1;
        const reason = error instanceof Error ? error.message : String(error);
        const retryable = retryPolicy.retryableReasons.includes(reason as MasonRetryPolicy["retryableReasons"][number]);
        if (!retryable || attempt > retryPolicy.maxAttempts) {
          throw error;
        }
        transition("EXECUTING", "retrying_transient_failure", "retrying");
      }
    }

    transition("CAPTURING_EVIDENCE", "capturing_evidence");
    const evidence = await dependencies.captureEvidence(context, result!);
    context = {
      ...context,
      evidence: [...context.evidence, ...evidence],
    };

    transition("RECORDING_LEDGER", "recording_ledger");
    await dependencies.updateLedger(context);

    transition("COMPLETED", "execution_completed");
    await dependencies.publishCompletion(events[events.length - 1]);
    return { context, events };
  } catch (error) {
    transition("FAILED", "execution_failure", "failure");
    if (dependencies.rollback) {
      await dependencies.rollback(context);
      transition("ROLLED_BACK", "rollback_completed");
    }
    return { context, events };
  }
}

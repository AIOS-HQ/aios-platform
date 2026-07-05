import type { CompanyContextEnvelope, WorkerContext } from "./types";

/**
 * Derive the execution context a specific worker begins from. This is the
 * mechanism behind AIOS Law 5 (Everything Is Context-Aware) and the "never
 * hardcode company behavior" rule: a worker reads its identity, vision/mission,
 * objectives, priorities, policies, governance, compliance, operating rules,
 * brand, and connector bindings from the company's envelope — plus its own
 * activation (enabled + autonomy level + config).
 */
export function deriveWorkerContext(
  envelope: CompanyContextEnvelope,
  worker: string,
): WorkerContext {
  const activation = envelope.workforce.find((w) => w.worker === worker);
  return {
    worker,
    companyId: envelope.companyId,
    companyName: envelope.companyName,
    industry: envelope.industry,
    vision: envelope.vision,
    mission: envelope.mission,
    coreValues: envelope.coreValues,
    brand: envelope.brand,
    objectives: envelope.objectives,
    priorities: envelope.priorities,
    policies: envelope.policies,
    governance: envelope.governance,
    compliance: envelope.compliance,
    operatingRules: envelope.operatingRules,
    connectors: envelope.connectors,
    enabled: activation?.enabled ?? false,
    autonomyLevel: activation?.autonomyLevel,
    workerConfig: activation?.config,
  };
}

/** Connector ids this company has bound for a worker (enabled bindings only). */
export function activeConnectorIds(context: WorkerContext): string[] {
  return context.connectors
    .filter((c) => c.enabled !== false)
    .map((c) => c.connectorId);
}

import "server-only";

import {
  upsertEnvelope,
  type EnvelopeUpsert,
  type WorkerActivation,
  type CompanyObjective,
} from "@/lib/company/envelope";
import { AIOS_WORKFORCE, isFounderOnlyAgent } from "@/lib/workforce/registry";

/**
 * AI Workforce as a Service — provisioning core (Priority 8).
 *
 * Turns an onboarding spec into a fully-configured company: writes the Company
 * Context Envelope and activates the universal workforce. This is the north-star
 * mechanism — a customer answers onboarding, and the SAME universal runtime
 * specializes into their company via configuration (Law 1 + Law 2). No separate
 * codebase per company. Additive + inert (explicit entry point; owner-scoped).
 */

export interface OnboardingSpec {
  companyName: string;
  industry?: string;
  vision?: string;
  mission?: string;
  objectives?: string[];
  autonomyLevel?: number;
}

/** Activate the universal workforce (all non-founder-only workers) at a default autonomy. */
export function defaultWorkforceActivations(autonomyLevel = 2): WorkerActivation[] {
  return AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key)).map((a) => ({
    worker: a.key,
    enabled: true,
    autonomyLevel,
  }));
}

export interface ProvisionResult {
  ok: boolean;
  workersActivated: number;
}

/**
 * Provision (or re-provision) a company's AI workforce from an onboarding spec.
 * Idempotent via envelope upsert; connectors are bound + re-consented separately
 * (no tokens here). Returns how many workers were activated.
 */
export async function provisionWorkforce(args: {
  userId: string;
  companyId: string;
  onboarding: OnboardingSpec;
}): Promise<ProvisionResult> {
  const { userId, companyId, onboarding } = args;

  const objectives: CompanyObjective[] = (onboarding.objectives ?? []).map((title, i) => ({
    id: `obj-${i + 1}`,
    title,
    status: "active",
  }));

  const workforce = defaultWorkforceActivations(onboarding.autonomyLevel ?? 2);

  const upsert: EnvelopeUpsert = {
    companyId,
    userId,
    companyName: onboarding.companyName,
    industry: onboarding.industry ?? null,
    vision: onboarding.vision ?? null,
    mission: onboarding.mission ?? null,
    objectives,
    workforce,
  };

  const ok = await upsertEnvelope(upsert);
  return { ok, workersActivated: ok ? workforce.length : 0 };
}

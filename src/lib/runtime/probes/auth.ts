import "server-only";

import { requireUser } from "@/lib/auth/user";
import { getCompany } from "@/lib/data/os/companies";
import type { ProbeScope, RuntimeProbeResult } from "@/lib/runtime/probes/types";

const SECRET_PATTERN = /(token|secret|password|credential|authorization|cookie|bearer|refresh)/i;

export class ProbeAuthorizationError extends Error {
  code: "unauthorized" | "forbidden";

  constructor(code: "unauthorized" | "forbidden", message: string) {
    super(message);
    this.code = code;
    this.name = "ProbeAuthorizationError";
  }
}

export async function authorizeProbeScope(requested: ProbeScope): Promise<ProbeScope> {
  const user = await requireUser();
  if (requested.userId !== user.id) {
    throw new ProbeAuthorizationError("forbidden", "Probe scope user does not match authenticated user.");
  }

  if (requested.companyId) {
    const owned = await getCompany(requested.companyId);
    if (!owned) {
      throw new ProbeAuthorizationError("forbidden", "Company is not accessible for the authenticated user.");
    }
  }

  return { userId: user.id, companyId: requested.companyId };
}

export function sanitizeProbeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const compact = reason.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  if (SECRET_PATTERN.test(compact)) {
    return "Probe source failed with a restricted error payload.";
  }
  return compact.length > 240 ? `${compact.slice(0, 240)}…` : compact;
}

export function sanitizeProbe(result: RuntimeProbeResult): RuntimeProbeResult {
  const safeSummary = SECRET_PATTERN.test(result.summary)
    ? "Probe produced a restricted summary."
    : result.summary;

  const safeRecommendedAction = result.recommendedAction
    ? SECRET_PATTERN.test(result.recommendedAction)
      ? "Review source diagnostics in authorized tools."
      : result.recommendedAction
    : undefined;

  return {
    ...result,
    summary: safeSummary,
    reason: sanitizeProbeReason(result.reason),
    recommendedAction: safeRecommendedAction,
    evidence: result.evidence.map((e) => ({
      source: e.source,
      observedAt: e.observedAt,
      ref: SECRET_PATTERN.test(e.ref) ? "[redacted]" : e.ref,
    })),
  };
}

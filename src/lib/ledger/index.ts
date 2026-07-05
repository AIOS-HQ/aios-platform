import "server-only";

import { getEnvelope } from "@/lib/company/envelope";
import { computeFinancialSnapshot } from "./metrics";
import type { FinancialInput, FinancialSnapshot } from "./types";

/**
 * Ledger (Foundation 5) — AIOS Chief Financial Officer, public surface.
 * Reads the company's financial context from the Company Context Envelope and
 * computes a FinancialSnapshot. Additive + inert; owner-scoped via the envelope
 * (RLS). Live accounting connectors are a future Layer-1 addition.
 */
export * from "./types";
export * from "./metrics";

export async function getCompanyFinancialSnapshot(companyId: string): Promise<FinancialSnapshot> {
  const envelope = await getEnvelope(companyId);
  const fc: Record<string, unknown> = envelope?.financialContext ?? {};
  const pick = (k: string): number | undefined =>
    typeof fc[k] === "number" ? (fc[k] as number) : undefined;

  const input: FinancialInput = {
    currency: typeof fc.currency === "string" ? fc.currency : undefined,
    revenue: pick("revenue"),
    expenses: pick("expenses"),
    cashOnHand: pick("cashOnHand"),
    mrr: pick("mrr"),
    arr: pick("arr"),
    burnRate: pick("burnRate"),
    nrr: pick("nrr"),
    churnRate: pick("churnRate"),
    cac: pick("cac"),
    ltv: pick("ltv"),
  };
  return computeFinancialSnapshot(input);
}

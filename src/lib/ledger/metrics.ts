import type { FinancialInput, FinancialSnapshot } from "./types";

/**
 * Ledger metrics engine — pure derivation of a FinancialSnapshot + SaaS metrics
 * (ARR, burn, runway, margin, LTV:CAC) from provided inputs. Deterministic; no
 * I/O. Missing inputs yield null (never guessed).
 */

function num(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function computeFinancialSnapshot(input: FinancialInput): FinancialSnapshot {
  const currency = input.currency ?? "USD";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses);
  const cashOnHand = num(input.cashOnHand);
  const mrr = num(input.mrr);
  const arr = num(input.arr) ?? (mrr !== null ? mrr * 12 : null);

  const grossProfit = revenue !== null && expenses !== null ? revenue - expenses : null;
  const netProfit = grossProfit;
  const cashFlow = grossProfit;
  const grossMargin =
    revenue !== null && revenue > 0 && grossProfit !== null
      ? (grossProfit / revenue) * 100
      : null;

  const burnRate =
    num(input.burnRate) ??
    (revenue !== null && expenses !== null ? Math.max(0, expenses - revenue) : null);
  const runwayMonths =
    cashOnHand !== null && burnRate !== null && burnRate > 0 ? cashOnHand / burnRate : null;

  const cac = num(input.cac);
  const ltv = num(input.ltv);
  const ltvCacRatio = cac !== null && cac > 0 && ltv !== null ? ltv / cac : null;

  return {
    currency,
    revenue,
    expenses,
    grossProfit,
    netProfit,
    grossMargin,
    cashOnHand,
    cashFlow,
    burnRate,
    runwayMonths,
    mrr,
    arr,
    nrr: num(input.nrr),
    churnRate: num(input.churnRate),
    cac,
    ltv,
    ltvCacRatio,
    profitable: netProfit !== null ? netProfit > 0 : null,
  };
}

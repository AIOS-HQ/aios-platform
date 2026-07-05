/**
 * Ledger (Foundation 5) — AIOS Chief Financial Officer: shared financial types.
 * A FinancialSnapshot is a derived, point-in-time view of a company's finances
 * (income, cash, SaaS metrics). Inputs come from the Company Context Envelope's
 * financial context today; live accounting connectors (QuickBooks/Xero/Stripe)
 * are a future Layer-1 addition.
 */

export interface FinancialInput {
  currency?: string;
  revenue?: number;
  expenses?: number;
  cashOnHand?: number;
  mrr?: number;
  arr?: number;
  burnRate?: number;
  nrr?: number;
  churnRate?: number;
  cac?: number;
  ltv?: number;
}

export interface FinancialSnapshot {
  currency: string;
  revenue: number | null;
  expenses: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  grossMargin: number | null; // %
  cashOnHand: number | null;
  cashFlow: number | null;
  burnRate: number | null; // monthly net burn
  runwayMonths: number | null;
  mrr: number | null;
  arr: number | null;
  nrr: number | null; // %
  churnRate: number | null; // %
  cac: number | null;
  ltv: number | null;
  ltvCacRatio: number | null;
  profitable: boolean | null;
}

/**
 * Company Template visual + business metadata for the Marketplace storefront —
 * hero gradient, included dashboards, and estimated monthly cost + company size.
 * Kept as a companion map (keyed by template id) so the ratified template
 * catalog stays untouched; the storefront merges these at display time. Pure
 * data; a sensible default covers any template without an explicit entry.
 */
export interface TemplateVisuals {
  /** Two hex stops for the card's hero gradient banner (no external image asset). */
  heroColors: [string, string];
  dashboards: string[];
  estimatedMonthlyCost: string;
  estimatedCompanySize: string;
}

const DEFAULT: TemplateVisuals = {
  heroColors: ["#2f6bff", "#8fd0ff"],
  dashboards: ["Executive", "Operations"],
  estimatedMonthlyCost: "$2,000/mo",
  estimatedCompanySize: "Solo founder → 25",
};

export const TEMPLATE_VISUALS: Record<string, TemplateVisuals> = {
  tpl_saas_startup: {
    heroColors: ["#0ea5e9", "#6366f1"],
    dashboards: ["Growth", "Product", "Revenue"],
    estimatedMonthlyCost: "$1,800/mo",
    estimatedCompanySize: "Solo founder → 10",
  },
  tpl_aviation_claims: {
    heroColors: ["#0284c7", "#0f766e"],
    dashboards: ["Claims", "Compliance", "CSAT"],
    estimatedMonthlyCost: "$2,600/mo",
    estimatedCompanySize: "5 → 25",
  },
  tpl_law_firm: {
    heroColors: ["#7c3aed", "#1e293b"],
    dashboards: ["Matters", "Utilization", "Compliance"],
    estimatedMonthlyCost: "$2,200/mo",
    estimatedCompanySize: "3 → 20",
  },
  tpl_accounting_firm: {
    heroColors: ["#059669", "#0d9488"],
    dashboards: ["Close", "Filings", "Advisory"],
    estimatedMonthlyCost: "$2,000/mo",
    estimatedCompanySize: "3 → 15",
  },
  tpl_real_estate: {
    heroColors: ["#f59e0b", "#ef4444"],
    dashboards: ["Listings", "Pipeline", "Commissions"],
    estimatedMonthlyCost: "$1,600/mo",
    estimatedCompanySize: "2 → 30",
  },
  tpl_healthcare_practice: {
    heroColors: ["#06b6d4", "#3b82f6"],
    dashboards: ["Patients", "Compliance", "Collections"],
    estimatedMonthlyCost: "$2,400/mo",
    estimatedCompanySize: "5 → 40",
  },
  tpl_manufacturing: {
    heroColors: ["#64748b", "#f97316"],
    dashboards: ["OEE", "Supply Chain", "Quality"],
    estimatedMonthlyCost: "$3,200/mo",
    estimatedCompanySize: "20 → 200",
  },
  tpl_restaurant_group: {
    heroColors: ["#f43f5e", "#f59e0b"],
    dashboards: ["Food Cost", "Covers", "Labor"],
    estimatedMonthlyCost: "$1,500/mo",
    estimatedCompanySize: "10 → 150",
  },
  tpl_ecommerce: {
    heroColors: ["#8b5cf6", "#ec4899"],
    dashboards: ["Growth", "Fulfillment", "Unit Economics"],
    estimatedMonthlyCost: "$1,900/mo",
    estimatedCompanySize: "2 → 25",
  },
  tpl_startup_accelerator: {
    heroColors: ["#2563eb", "#7c3aed"],
    dashboards: ["Cohorts", "Portfolio", "Deal Flow"],
    estimatedMonthlyCost: "$2,800/mo",
    estimatedCompanySize: "5 → 30",
  },
};

export function getTemplateVisuals(templateId: string): TemplateVisuals {
  return TEMPLATE_VISUALS[templateId] ?? DEFAULT;
}

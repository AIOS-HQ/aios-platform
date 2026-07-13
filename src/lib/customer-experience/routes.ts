export type ProductSurface = "public" | "subscriber" | "founder";

export interface ProductRouteRecord {
  route: string;
  purpose: string;
  surface: ProductSurface;
  status: "operational" | "partial" | "configuration_required" | "not_tracked";
  privacy: string;
}

export const SUBSCRIBER_HARMONY_ROUTES: ProductRouteRecord[] = [
  {
    route: "/harmony/operator",
    purpose: "Private Harmony operator/chat workspace.",
    surface: "subscriber",
    status: "operational",
    privacy: "Owner-scoped session and product data.",
  },
  {
    route: "/harmony/personal",
    purpose: "Subscriber dashboard for tasks, goals, notes, and Harmony suggestions.",
    surface: "subscriber",
    status: "operational",
    privacy: "Aggregates only the signed-in subscriber's records.",
  },
  {
    route: "/harmony/onboarding",
    purpose: "Guided setup for a subscriber's personal operating system.",
    surface: "subscriber",
    status: "partial",
    privacy: "Current completion is not durably tracked.",
  },
  {
    route: "/harmony/tasks",
    purpose: "Personal task creation, updates, and completion.",
    surface: "subscriber",
    status: "operational",
    privacy: "Rows are RLS owner-scoped.",
  },
  {
    route: "/harmony/goals",
    purpose: "Personal goals and progress.",
    surface: "subscriber",
    status: "operational",
    privacy: "Rows are RLS owner-scoped.",
  },
  {
    route: "/harmony/notes",
    purpose: "Private notes and personal knowledge capture.",
    surface: "subscriber",
    status: "operational",
    privacy: "Founder dashboards never expose note content.",
  },
  {
    route: "/settings/integrations",
    purpose: "Subscriber-owned personal connector setup.",
    surface: "subscriber",
    status: "partial",
    privacy: "Founder dashboards show aggregate connection health only.",
  },
  {
    route: "/settings/connections",
    purpose: "Subscriber connection health and disconnect controls.",
    surface: "subscriber",
    status: "partial",
    privacy: "Tokens are never selected for display.",
  },
];

export const CUSTOMER_EXPERIENCE_ROUTES: ProductRouteRecord[] = [
  {
    route: "/harmony/customer-experience",
    purpose: "Founder aggregate overview of Subscriber Harmony.",
    surface: "founder",
    status: "operational",
    privacy: "Aggregated counts only; no private content.",
  },
  {
    route: "/harmony/customer-experience/preview",
    purpose: "Synthetic preview of subscriber surfaces.",
    surface: "founder",
    status: "operational",
    privacy: "No impersonation and no real customer records.",
  },
  {
    route: "/harmony/customer-experience/journey",
    purpose: "Visitor-to-subscriber lifecycle map.",
    surface: "founder",
    status: "operational",
    privacy: "Uses route and aggregate status only.",
  },
  {
    route: "/harmony/customer-experience/analytics",
    purpose: "Privacy-conscious Subscriber Harmony KPI dashboard.",
    surface: "founder",
    status: "partial",
    privacy: "Small cohorts are summarized and private content is suppressed.",
  },
  {
    route: "/harmony/customer-experience/reliability",
    purpose: "Customer-facing reliability and unresolved operational issues.",
    surface: "founder",
    status: "operational",
    privacy: "Ops metadata only.",
  },
  {
    route: "/harmony/customer-experience/feedback",
    purpose: "Feedback intake status and support work routing.",
    surface: "founder",
    status: "not_tracked",
    privacy: "No feedback-content store exists yet.",
  },
  {
    route: "/harmony/customer-experience/releases",
    purpose: "Subscriber-impacting release readiness.",
    surface: "founder",
    status: "partial",
    privacy: "Release metadata only.",
  },
];

export const CUSTOMER_SPECIALIST_OWNERSHIP = [
  {
    agent: "Harmony",
    ownership: "Orchestrates customer operations, summarizes status, and routes specialist work.",
  },
  {
    agent: "Pulse",
    ownership: "Monitors uptime, failures, route health, and customer-impacting incidents.",
  },
  {
    agent: "Auditor",
    ownership: "Audits route coverage, accessibility, broken links, SEO, onboarding, permissions, and readiness.",
  },
  {
    agent: "Catalyst",
    ownership: "Owns public copy, subscriber education, onboarding copy, and conversion improvements.",
  },
  {
    agent: "Mason",
    ownership: "Implements approved product corrections through PR/preview workflows only.",
  },
  {
    agent: "Horizon",
    ownership: "Tracks activation, adoption, goals, roadmap progress, and product opportunities.",
  },
  {
    agent: "Aegis",
    ownership: "Monitors access boundaries, upload safety, form security, and privacy risk.",
  },
  {
    agent: "Atlas",
    ownership: "Keeps help, onboarding knowledge, docs, and Julius context accurate.",
  },
  {
    agent: "Ambassador",
    ownership: "Coordinates authorized support conversations and WhatsApp Business channels.",
  },
  {
    agent: "Ledger",
    ownership: "Records releases, incidents, approvals, experiments, and outcomes.",
  },
];

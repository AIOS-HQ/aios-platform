/**
 * Founder Harmony (L3.5) domain catalog — company-agnostic templates and the
 * canonical enums for the owner Operating System. Pure + dependency-free.
 *
 * Templates are applied when the owner spins up a company's departments/agents;
 * the same catalog seeds AIOS, AirBid, or any future company. Nothing here is
 * persisted — it's the blueprint the data layer instantiates per company.
 */
import type { AutonomyLevel } from "./autonomy";

/** Top-level life/business domains the owner operates through Harmony. */
export type CompanyDomain = "household" | "personal" | "business";

/** Display order for domains in the Command Center. */
export const DOMAINS: readonly CompanyDomain[] = [
  "business",
  "household",
  "personal",
] as const;

export type DepartmentKey =
  | "marketing"
  | "operations"
  | "code"
  | "research"
  | "sales"
  | "support"
  | "finance";

/** Work-queue lifecycle states (Founder objective → Harmony execution). */
export type WorkStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "awaiting_approval"
  | "completed";

export const WORK_STATUSES: readonly WorkStatus[] = [
  "pending",
  "in_progress",
  "blocked",
  "awaiting_approval",
  "completed",
] as const;

/** Approval Center categories. */
export type ApprovalType =
  | "content"
  | "deployment"
  | "financial"
  | "integration"
  | "high_risk";

export const APPROVAL_TYPES: readonly ApprovalType[] = [
  "content",
  "deployment",
  "financial",
  "integration",
  "high_risk",
] as const;

/** Unified activity-feed event kinds. */
export type ActivityKind =
  | "agent_action"
  | "department_action"
  | "approval"
  | "objective"
  | "project"
  | "recommendation"
  | "system";

export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "agent_action",
  "department_action",
  "approval",
  "objective",
  "project",
  "recommendation",
  "system",
] as const;

export type AgentTemplate = { key: string; name: string; role: string };

export type DepartmentTemplate = {
  key: DepartmentKey;
  name: string;
  description: string;
  /** Default autonomy when the department is created (owner can change it). */
  defaultAutonomy: AutonomyLevel;
  /** Suggested starter agents (extensible — the owner can add/remove). */
  agents: AgentTemplate[];
};

export const DEPARTMENT_TEMPLATES: readonly DepartmentTemplate[] = [
  {
    key: "code",
    name: "Code",
    description:
      "Software development operations: backlog, issues, sprints, PRs, releases, tech debt, deployments, and engineering reporting.",
    defaultAutonomy: 2,
    agents: [
      { key: "engineering_manager", name: "Engineering Manager", role: "Plans sprints, triages the backlog, reports status" },
      { key: "coding", name: "Coding Agent", role: "Implements features and fixes" },
      { key: "qa", name: "QA Agent", role: "Reviews changes and verifies quality" },
      { key: "testing", name: "Testing Agent", role: "Writes and runs automated tests" },
      { key: "deployment", name: "Deployment Agent", role: "Manages releases and deployments" },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Brand, content, and demand across channels.",
    defaultAutonomy: 3,
    agents: [
      { key: "linkedin", name: "LinkedIn Agent", role: "LinkedIn content and engagement" },
      { key: "youtube", name: "YouTube Agent", role: "Video content and channel growth" },
      { key: "seo", name: "SEO Agent", role: "Search optimization and rankings" },
      { key: "blog", name: "Blog Agent", role: "Long-form articles" },
      { key: "email", name: "Email Agent", role: "Newsletters and lifecycle email" },
    ],
  },
  {
    key: "research",
    name: "Research",
    description: "Market, competitive, and domain intelligence.",
    defaultAutonomy: 3,
    agents: [
      { key: "research_analyst", name: "Research Analyst", role: "Synthesizes findings into briefs" },
      { key: "competitive_intelligence", name: "Competitive Intelligence Agent", role: "Tracks competitors" },
      { key: "market_intelligence", name: "Market Intelligence Agent", role: "Tracks market and trends" },
    ],
  },
  {
    key: "operations",
    name: "Operations",
    description: "Cross-functional coordination, process, and logistics.",
    defaultAutonomy: 2,
    agents: [
      { key: "ops_coordinator", name: "Ops Coordinator", role: "Coordinates cross-department work" },
      { key: "process", name: "Process Agent", role: "Documents and improves processes" },
    ],
  },
  {
    key: "sales",
    name: "Sales",
    description: "Pipeline, outreach, and revenue.",
    defaultAutonomy: 2,
    agents: [
      { key: "sdr", name: "SDR Agent", role: "Prospecting and outreach" },
      { key: "pipeline", name: "Pipeline Agent", role: "Deal tracking and follow-up" },
    ],
  },
  {
    key: "support",
    name: "Support",
    description: "Customer support and knowledge.",
    defaultAutonomy: 2,
    agents: [
      { key: "triage", name: "Support Triage Agent", role: "Routes and triages requests" },
      { key: "knowledge_base", name: "Knowledge Base Agent", role: "Maintains help content" },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Bookkeeping, reporting, and forecasting.",
    defaultAutonomy: 0,
    agents: [
      { key: "bookkeeping", name: "Bookkeeping Agent", role: "Categorizes and records transactions" },
      { key: "reporting", name: "Reporting Agent", role: "Financial statements and dashboards" },
      { key: "forecasting", name: "Forecasting Agent", role: "Projections and scenarios" },
    ],
  },
] as const;

export const DEPARTMENT_KEYS: readonly DepartmentKey[] =
  DEPARTMENT_TEMPLATES.map((d) => d.key);

export function getDepartmentTemplate(
  key: string,
): DepartmentTemplate | undefined {
  return DEPARTMENT_TEMPLATES.find((d) => d.key === key);
}

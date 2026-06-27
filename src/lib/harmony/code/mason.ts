import {
  CONNECTORS,
  type ConnectorCapability,
  type RiskClass,
} from "@/lib/integrations/connectors";
import {
  getAgentConnectors,
  isFounderOnlyAgent,
  type AiosAgentKey,
} from "@/lib/workforce/registry";

export const MASON_AGENT_KEY = "mason" satisfies AiosAgentKey;

export type MasonTaskCategory =
  | "website"
  | "web_app"
  | "mobile_app"
  | "saas_platform"
  | "api"
  | "database"
  | "codebase"
  | "integration"
  | "automation"
  | "infrastructure"
  | "testing"
  | "documentation"
  | "bug_fix"
  | "refactor"
  | "deployment"
  | "architecture"
  | "performance"
  | "security";

export type MasonCapabilityMode = "inspect" | "plan" | "prepare";

export interface MasonCapability {
  id: string;
  title: string;
  mode: MasonCapabilityMode;
  description: string;
  requiresApproval: boolean;
}

export interface MasonTaskClassification {
  owner: typeof MASON_AGENT_KEY;
  categories: MasonTaskCategory[];
  shouldRouteToMason: boolean;
  requiresFounderApproval: boolean;
  reason: string;
}

export interface MasonExecutionPlan {
  owner: typeof MASON_AGENT_KEY;
  classification: MasonTaskClassification;
  safeBoundary: typeof MASON_SAFE_EXECUTION_BOUNDARY;
  implementationPlan: string[];
  patchPlan: string[];
  recommendedFiles: string[];
  validationSteps: string[];
  coordinationAgents: readonly ["qa", "testing", "deployment"];
  approvalCheckpoints: string[];
  prReadySummary: string;
}

export interface MasonConnectorCapability {
  connector: "github" | "vercel";
  capability: ConnectorCapability;
  allowedForMason: boolean;
  reason: string;
}

export const MASON_SAFE_EXECUTION_BOUNDARY = {
  branchRequired: true,
  pullRequestRequired: true,
  vercelPreviewRequired: true,
  founderApprovalRequiredForMerge: true,
  directProductionEditingAllowed: false,
  mergeWithoutFounderApprovalAllowed: false,
  destructiveOperationsAllowed: false,
  subscriberFacing: false,
  airbidAccessRequiresExplicitFounderScope: true,
} as const;

export const MASON_CAPABILITIES: readonly MasonCapability[] = [
  {
    id: "inspect_repositories",
    title: "Inspect repositories",
    mode: "inspect",
    description: "Review repository structure, code context, issues, branches, pull requests, builds, and previews.",
    requiresApproval: false,
  },
  {
    id: "classify_engineering_tasks",
    title: "Classify engineering tasks",
    mode: "plan",
    description: "Identify software, application, database, integration, testing, documentation, and infrastructure work.",
    requiresApproval: false,
  },
  {
    id: "create_implementation_plans",
    title: "Create implementation plans",
    mode: "plan",
    description: "Translate founder objectives into scoped engineering plans with dependencies and safe execution order.",
    requiresApproval: false,
  },
  {
    id: "generate_patch_plans",
    title: "Generate patch plans",
    mode: "prepare",
    description: "Prepare file-level change plans and PR-ready instructions before code execution begins.",
    requiresApproval: true,
  },
  {
    id: "recommend_files_to_change",
    title: "Recommend files to change",
    mode: "prepare",
    description: "Identify likely implementation, test, documentation, configuration, and validation files.",
    requiresApproval: false,
  },
  {
    id: "prepare_validation_steps",
    title: "Prepare validation steps",
    mode: "prepare",
    description: "Define typecheck, test, lint, build, preview, and regression validation before handoff.",
    requiresApproval: false,
  },
  {
    id: "coordinate_code_agents",
    title: "Coordinate QA, Testing, and Deployment",
    mode: "plan",
    description: "Route quality review, automated testing, and deployment preparation to the existing Code department agents.",
    requiresApproval: false,
  },
  {
    id: "create_pr_ready_summaries",
    title: "Create PR-ready execution summaries",
    mode: "prepare",
    description: "Summarize changes, validation, known risks, and founder approval gates for pull requests.",
    requiresApproval: false,
  },
] as const;

const TASK_CATEGORY_KEYWORDS: Record<MasonTaskCategory, readonly string[]> = {
  website: ["website", "site", "landing page", "homepage", "marketing page"],
  web_app: ["web app", "app", "frontend", "react", "next.js", "nextjs", "component", "page"],
  mobile_app: ["mobile app", "ios", "android", "react native", "expo"],
  saas_platform: ["saas", "platform", "tenant", "subscription", "workspace"],
  api: ["api", "endpoint", "route", "server action", "webhook"],
  database: ["database", "db", "supabase", "migration", "table", "column", "rls", "index"],
  codebase: ["code", "repo", "repository", "github", "branch", "pull request", "pr", "typescript"],
  integration: ["integration", "connector", "oauth", "provider"],
  automation: ["automation", "script", "job", "cron", "workflow"],
  infrastructure: ["infrastructure", "config", "environment", "vercel", "deployment", "ci", "build"],
  testing: ["test", "testing", "qa", "vitest", "eslint", "typecheck", "regression"],
  documentation: ["documentation", "docs", "readme", "runbook"],
  bug_fix: ["bug", "fix", "error", "failure", "broken", "regression"],
  refactor: ["refactor", "cleanup", "technical debt", "simplify"],
  deployment: ["deploy", "deployment", "release", "preview", "production readiness"],
  architecture: ["architecture", "system design", "technical design"],
  performance: ["performance", "latency", "slow", "optimize", "speed"],
  security: ["security", "csp", "token", "secret", "auth", "authorization", "permission"],
};

const APPROVAL_KEYWORDS = [
  "code",
  "commit",
  "merge",
  "production",
  "deploy",
  "database",
  "migration",
  "secret",
  "token",
  "security",
  "delete",
  "remove",
  "destructive",
  "environment",
] as const;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.+#]+/g, " ").trim();
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(normalize(keyword)));
}

export function isMasonFounderOnly(): boolean {
  return isFounderOnlyAgent(MASON_AGENT_KEY);
}

export function isMasonSubscriberFacing(): boolean {
  return MASON_SAFE_EXECUTION_BOUNDARY.subscriberFacing;
}

export function getMasonConnectorIds(): string[] {
  return getAgentConnectors(MASON_AGENT_KEY);
}

export function classifyMasonEngineeringTask(input: string): MasonTaskClassification {
  const text = normalize(input);
  const categories = Object.entries(TASK_CATEGORY_KEYWORDS)
    .filter(([, keywords]) => includesAny(text, keywords))
    .map(([category]) => category as MasonTaskCategory);
  const shouldRouteToMason = categories.length > 0;
  const requiresFounderApproval = shouldRouteToMason && includesAny(text, APPROVAL_KEYWORDS);

  return {
    owner: MASON_AGENT_KEY,
    categories,
    shouldRouteToMason,
    requiresFounderApproval,
    reason: shouldRouteToMason
      ? `Mason owns ${categories.join(", ")} work through branch, PR, preview, and Founder approval gates.`
      : "No software engineering signal was strong enough to route this task to Mason.",
  };
}

export function masonOwnsEngineeringTask(input: string): boolean {
  return classifyMasonEngineeringTask(input).shouldRouteToMason;
}

export function requiresMasonFounderApproval(input: string): boolean {
  return classifyMasonEngineeringTask(input).requiresFounderApproval;
}

function connectorRisk(capability: ConnectorCapability): RiskClass {
  if (capability.risk) return capability.risk;
  return capability.mode === "read" ? "routine" : "approval";
}

function isAllowedMasonConnectorCapability(connector: string, capability: ConnectorCapability): boolean {
  if (connector === "github") {
    return !["merge_pull_request", "delete_repository"].includes(capability.id);
  }
  if (connector === "vercel") {
    return capability.mode === "read";
  }
  return false;
}

export function getMasonConnectorCapabilities(): MasonConnectorCapability[] {
  return CONNECTORS
    .filter((connector) => connector.id === "github" || connector.id === "vercel")
    .flatMap((connector) =>
      connector.capabilities.map((capability) => {
        const allowedForMason = isAllowedMasonConnectorCapability(connector.id, capability);
        const risk = connectorRisk(capability);
        return {
          connector: connector.id as "github" | "vercel",
          capability,
          allowedForMason,
          reason: allowedForMason
            ? `Allowed inside Mason's PR/preview boundary with ${risk} connector policy.`
            : "Excluded from Mason because it can bypass Founder approval, mutate production, or destroy assets.",
        };
      }),
    );
}

function recommendedFilesFor(categories: MasonTaskCategory[]): string[] {
  const files = new Set<string>();
  if (categories.some((category) => ["website", "web_app"].includes(category))) {
    files.add("src/app/**");
    files.add("src/components/**");
  }
  if (categories.includes("api")) files.add("src/app/api/**");
  if (categories.includes("database")) {
    files.add("src/lib/supabase/**");
    files.add("supabase/migrations/**");
  }
  if (categories.includes("integration")) files.add("src/lib/integrations/**");
  if (categories.includes("testing")) files.add("tests/**");
  if (categories.includes("documentation")) files.add("docs/**");
  if (categories.some((category) => ["infrastructure", "deployment"].includes(category))) {
    files.add("next.config.*");
    files.add("vercel.json");
    files.add(".github/workflows/**");
  }
  if (files.size === 0) {
    files.add("src/**");
    files.add("tests/**");
  }
  return [...files];
}

export function createMasonExecutionPlan(input: {
  title: string;
  detail?: string | null;
}): MasonExecutionPlan {
  const objective = `${input.title}\n${input.detail ?? ""}`.trim();
  const classification = classifyMasonEngineeringTask(objective);
  const recommendedFiles = recommendedFilesFor(classification.categories);
  const implementationPlan = [
    "Inspect the repository context, existing architecture, related tests, and active branch state.",
    "Classify the engineering task and confirm Mason is the correct founder-only owner.",
    "Prepare a scoped implementation plan that preserves existing architecture and approval gates.",
    "Implement only on an isolated branch when code mutation is explicitly authorized.",
    "Prepare a pull request with validation evidence, Vercel preview review, and Founder approval before merge.",
  ];
  const patchPlan = recommendedFiles.map((file) => `Review and patch ${file} only if needed for the scoped objective.`);
  const validationSteps = [
    "npm run typecheck",
    "npm test",
    "npm run i18n:check",
    "targeted ESLint on changed files",
    "git diff --check",
    "npm run build",
    "Verify the Vercel preview before Founder approval.",
  ];
  const approvalCheckpoints = [
    "Founder scopes the repository and objective before Mason begins execution.",
    "Risky code, database, infrastructure, security, production, or secret-adjacent work requires explicit approval.",
    "Merge requires an approved pull request, passing checks, Vercel preview validation, and explicit Founder approval.",
  ];

  return {
    owner: MASON_AGENT_KEY,
    classification,
    safeBoundary: MASON_SAFE_EXECUTION_BOUNDARY,
    implementationPlan,
    patchPlan,
    recommendedFiles,
    validationSteps,
    coordinationAgents: ["qa", "testing", "deployment"],
    approvalCheckpoints,
    prReadySummary: [
      `Mason plan for "${input.title}".`,
      classification.reason,
      `Recommended files: ${recommendedFiles.join(", ")}.`,
      "Execution remains branch -> PR -> Vercel preview -> Founder approval -> merge.",
    ].join(" "),
  };
}

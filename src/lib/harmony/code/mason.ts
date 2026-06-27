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
  | "landing_page"
  | "web_app"
  | "mobile_app"
  | "desktop_app"
  | "saas_platform"
  | "api"
  | "backend_service"
  | "database"
  | "ai_system"
  | "ai_agent"
  | "aios_module"
  | "codebase"
  | "integration"
  | "automation"
  | "infrastructure"
  | "devops"
  | "ci_cd"
  | "testing"
  | "documentation"
  | "bug_fix"
  | "refactor"
  | "deployment"
  | "architecture"
  | "performance"
  | "security";

export type MasonCapabilityMode = "inspect" | "plan" | "prepare" | "execute" | "verify" | "report" | "learn";
export type MasonRuntimeRisk = "routine" | "approval" | "destructive";

export interface MasonCapability {
  id: string;
  title: string;
  mode: MasonCapabilityMode;
  description: string;
  requiresApproval: boolean;
  risk: MasonRuntimeRisk;
  connector?: "github" | "vercel";
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

export type MasonRuntimePhase =
  | "intake"
  | "analysis"
  | "planning"
  | "implementation"
  | "validation"
  | "delivery"
  | "learning";

export interface MasonRuntimeStep {
  id: string;
  title: string;
  phase: MasonRuntimePhase;
  capabilityId: string;
  risk: MasonRuntimeRisk;
  status: "ready" | "pending_approval" | "blocked";
  summary: string;
  connector?: "github" | "vercel";
  delegatesTo?: string[];
}

export interface MasonNativeRuntimePlan {
  provider: typeof MASON_AGENT_KEY;
  objective: string;
  repository: string | null;
  classification: MasonTaskClassification;
  executionPlan: MasonExecutionPlan;
  steps: MasonRuntimeStep[];
  automaticSteps: MasonRuntimeStep[];
  approvalGatedSteps: MasonRuntimeStep[];
  blockedSteps: MasonRuntimeStep[];
  memoryPlan: {
    recordObjective: boolean;
    recordRepository: boolean;
    recordFilesChanged: boolean;
    recordValidation: boolean;
    recordLessons: boolean;
    evolveCompanySkills: boolean;
    improveOrganizationalIntelligence: boolean;
  };
  boundarySummary: string;
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

const MASON_NATIVE_CAPABILITIES: readonly MasonCapability[] = [
  {
    id: "inspect_repositories",
    title: "Inspect repositories",
    mode: "inspect",
    description: "Review repository structure, code context, issues, branches, pull requests, builds, and previews.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "classify_engineering_tasks",
    title: "Classify engineering tasks",
    mode: "plan",
    description: "Identify software, application, database, integration, testing, documentation, and infrastructure work.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "create_implementation_plans",
    title: "Create implementation plans",
    mode: "plan",
    description: "Translate founder objectives into scoped engineering plans with dependencies and safe execution order.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "generate_patch_plans",
    title: "Generate patch plans",
    mode: "prepare",
    description: "Prepare file-level change plans and PR-ready instructions before code execution begins.",
    requiresApproval: true,
    risk: "approval",
  },
  {
    id: "recommend_files_to_change",
    title: "Recommend files to change",
    mode: "prepare",
    description: "Identify likely implementation, test, documentation, configuration, and validation files.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "prepare_validation_steps",
    title: "Prepare validation steps",
    mode: "prepare",
    description: "Define typecheck, test, lint, build, preview, and regression validation before handoff.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "coordinate_code_agents",
    title: "Coordinate QA, Testing, and Deployment",
    mode: "plan",
    description: "Route quality review, automated testing, and deployment preparation to the existing Code department agents.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "create_pr_ready_summaries",
    title: "Create PR-ready execution summaries",
    mode: "prepare",
    description: "Summarize changes, validation, known risks, and founder approval gates for pull requests.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "analyze_architecture",
    title: "Analyze architecture",
    mode: "inspect",
    description: "Assess architecture, dependencies, system boundaries, technical debt, and implementation risk.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "decompose_engineering_work",
    title: "Decompose engineering work",
    mode: "plan",
    description: "Break objectives into implementation, validation, documentation, and delivery work packages.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "generate_patches",
    title: "Generate patches",
    mode: "execute",
    description: "Prepare concrete code changes on an isolated branch after Founder approval.",
    requiresApproval: true,
    risk: "approval",
  },
  {
    id: "modify_files_on_branch",
    title: "Modify files on branch",
    mode: "execute",
    description: "Change repository files only on a scoped branch with approved implementation boundaries.",
    requiresApproval: true,
    risk: "approval",
  },
  {
    id: "run_validation_commands",
    title: "Run validation commands",
    mode: "verify",
    description: "Run typecheck, tests, lint, build, and focused regression verification.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "prepare_pull_request",
    title: "Prepare pull request",
    mode: "execute",
    description: "Create a PR-ready branch, summary, validation evidence, risks, and review notes.",
    requiresApproval: true,
    risk: "approval",
  },
  {
    id: "verify_vercel_preview",
    title: "Verify Vercel preview",
    mode: "verify",
    description: "Inspect preview deployment and build status before Founder merge approval.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "produce_engineering_reports",
    title: "Produce engineering reports",
    mode: "report",
    description: "Generate implementation, architecture, technical debt, refactoring, security, and performance reports.",
    requiresApproval: false,
    risk: "routine",
  },
  {
    id: "record_engineering_memory",
    title: "Record engineering memory",
    mode: "learn",
    description: "Persist objective, repository, changed files, validation, lessons, patterns, and metrics through Julius.",
    requiresApproval: false,
    risk: "routine",
  },
] as const;

function connectorCapabilityToMason(entry: MasonConnectorCapability): MasonCapability {
  const risk = connectorRisk(entry.capability);
  const allowedRoutineRead = entry.allowedForMason && entry.capability.mode === "read";
  return {
    id: `${entry.connector}.${entry.capability.id}`,
    title: `${entry.connector.toUpperCase()} ${entry.capability.id.replaceAll("_", " ")}`,
    mode: entry.capability.mode === "read" ? "inspect" : "execute",
    description: entry.reason,
    requiresApproval: !allowedRoutineRead,
    risk: entry.allowedForMason ? risk : "destructive",
    connector: entry.connector,
  };
}

export function getMasonCapabilityRegistry(): MasonCapability[] {
  return [
    ...MASON_NATIVE_CAPABILITIES,
    ...getMasonConnectorCapabilities().map(connectorCapabilityToMason),
  ];
}

export const MASON_CAPABILITIES: readonly MasonCapability[] = getMasonCapabilityRegistry();

const TASK_CATEGORY_KEYWORDS: Record<MasonTaskCategory, readonly string[]> = {
  website: ["website", "site", "homepage", "marketing page"],
  landing_page: ["landing page", "sales page"],
  web_app: ["web app", "app", "frontend", "react", "next.js", "nextjs", "component", "page"],
  mobile_app: ["mobile app", "ios", "android", "react native", "expo"],
  desktop_app: ["desktop app", "electron", "mac app", "windows app"],
  saas_platform: ["saas", "platform", "tenant", "subscription", "workspace"],
  api: ["api", "endpoint", "route", "server action", "webhook"],
  backend_service: ["backend", "service", "worker", "queue", "server"],
  database: ["database", "db", "supabase", "migration", "table", "column", "rls", "index"],
  ai_system: ["ai system", "llm", "model", "prompt", "inference", "rag"],
  ai_agent: ["ai agent", "agent", "workforce member"],
  aios_module: ["aios module", "harmony", "julius", "auditor", "workforce", "objective"],
  codebase: ["code", "repo", "repository", "github", "branch", "pull request", "pr", "typescript"],
  integration: ["integration", "connector", "oauth", "provider"],
  automation: ["automation", "script", "job", "cron", "workflow"],
  infrastructure: ["infrastructure", "config", "environment", "vercel", "deployment", "ci", "build"],
  devops: ["devops", "release", "pipeline", "ops"],
  ci_cd: ["ci/cd", "ci", "cd", "github actions", "workflow"],
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

function isDestructiveEngineeringText(input: string): boolean {
  return /delete|destroy|drop|wipe|remove repository|remove database|delete env|delete secret|production deploy|merge to main/.test(
    normalize(input),
  );
}

export function classifyMasonEngineeringTask(input: string): MasonTaskClassification {
  const text = normalize(input);
  const categories = Object.entries(TASK_CATEGORY_KEYWORDS)
    .filter(([, keywords]) => includesAny(text, keywords))
    .map(([category]) => category as MasonTaskCategory);
  const shouldRouteToMason = categories.length > 0;
  const requiresFounderApproval =
    shouldRouteToMason && (includesAny(text, APPROVAL_KEYWORDS) || isDestructiveEngineeringText(text));

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

export function isMasonRuntimeCapabilityAutonomous(capability: MasonCapability): boolean {
  return capability.risk === "routine" && !capability.requiresApproval;
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

function stepStatusFor(capability: MasonCapability, input: string): MasonRuntimeStep["status"] {
  if (capability.risk === "destructive" || isDestructiveEngineeringText(input)) return "blocked";
  return isMasonRuntimeCapabilityAutonomous(capability) ? "ready" : "pending_approval";
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

export function createMasonNativeRuntimePlan(input: {
  objective: string;
  detail?: string | null;
  repository?: string | null;
}): MasonNativeRuntimePlan {
  const objective = `${input.objective}\n${input.detail ?? ""}`.trim();
  const classification = classifyMasonEngineeringTask(objective);
  const executionPlan = createMasonExecutionPlan({
    title: input.objective,
    detail: input.detail,
  });
  const capabilities = getMasonCapabilityRegistry();
  const capability = (id: string) => capabilities.find((candidate) => candidate.id === id)!;
  const steps: MasonRuntimeStep[] = [
    {
      id: "intake",
      title: "Founder scope and task classification",
      phase: "intake",
      capabilityId: "classify_engineering_tasks",
      risk: "routine",
      status: "ready",
      summary: classification.reason,
    },
    {
      id: "repository_inspection",
      title: "Repository and dependency inspection",
      phase: "analysis",
      capabilityId: input.repository ? "github.list_branches" : "github.list_repos",
      risk: "routine",
      status: "ready",
      connector: "github",
      summary: input.repository
        ? `Inspect repository ${input.repository}, branches, PRs, issues, workflows, and dependency signals.`
        : "Inspect available Founder-authorized repositories before selecting execution scope.",
    },
    {
      id: "architecture_analysis",
      title: "Architecture and risk analysis",
      phase: "analysis",
      capabilityId: "analyze_architecture",
      risk: "routine",
      status: "ready",
      summary: "Analyze architecture, dependencies, security posture, performance risk, and technical debt.",
    },
    {
      id: "adaptive_plan",
      title: "Adaptive execution plan",
      phase: "planning",
      capabilityId: "decompose_engineering_work",
      risk: "routine",
      status: "ready",
      delegatesTo: ["engineering_manager"],
      summary: "Reuse Adaptive Planning, Company Skills, and Organizational Intelligence to create execution phases.",
    },
    {
      id: "patch_generation",
      title: "Patch generation and file modification",
      phase: "implementation",
      capabilityId: "generate_patches",
      risk: capability("generate_patches").risk,
      status: stepStatusFor(capability("generate_patches"), objective),
      summary: "Generate and apply patches only on a scoped branch after Founder approval.",
    },
    {
      id: "validation",
      title: "Validation and regression verification",
      phase: "validation",
      capabilityId: "run_validation_commands",
      risk: "routine",
      status: "ready",
      delegatesTo: ["qa", "testing"],
      summary: executionPlan.validationSteps.join("; "),
    },
    {
      id: "pull_request",
      title: "Pull request and review preparation",
      phase: "delivery",
      capabilityId: "prepare_pull_request",
      risk: capability("prepare_pull_request").risk,
      status: stepStatusFor(capability("prepare_pull_request"), objective),
      connector: "github",
      delegatesTo: ["deployment"],
      summary: "Prepare PR summary, review notes, risk report, and validation evidence.",
    },
    {
      id: "preview_verification",
      title: "Vercel preview verification",
      phase: "delivery",
      capabilityId: "vercel.deployment_status",
      risk: "routine",
      status: "ready",
      connector: "vercel",
      delegatesTo: ["deployment"],
      summary: "Verify preview/build status before Founder merge approval.",
    },
    {
      id: "learning",
      title: "Engineering memory and adaptive learning",
      phase: "learning",
      capabilityId: "record_engineering_memory",
      risk: "routine",
      status: "ready",
      summary: "Record objective, repository, files changed, validation, metrics, lessons, and reusable skills through Julius.",
    },
  ];

  return {
    provider: MASON_AGENT_KEY,
    objective: input.objective,
    repository: input.repository?.trim() || null,
    classification,
    executionPlan,
    steps,
    automaticSteps: steps.filter((step) => step.status === "ready"),
    approvalGatedSteps: steps.filter((step) => step.status === "pending_approval"),
    blockedSteps: steps.filter((step) => step.status === "blocked"),
    memoryPlan: {
      recordObjective: true,
      recordRepository: true,
      recordFilesChanged: true,
      recordValidation: true,
      recordLessons: true,
      evolveCompanySkills: true,
      improveOrganizationalIntelligence: true,
    },
    boundarySummary:
      "Mason may autonomously analyze, plan, validate, report, and learn. Code mutation, commits, pushes, PR creation, preview delivery, production deployment, and merge remain branch/PR/preview/Founder-approval gated.",
  };
}

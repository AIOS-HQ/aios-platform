import "server-only";

export const MASON_VALIDATION_POLICY_VERSION = "mason.validation-policy.v1" as const;

export const MASON_VALIDATION_REQUIREMENT_IDS = [
  "lint",
  "typecheck",
  "tests",
  "i18n",
  "build",
  "launch_validation",
  "vercel",
  "vercel_preview_comments",
  "milestone_7e_certification",
] as const;

export type MasonValidationRequirementId = (typeof MASON_VALIDATION_REQUIREMENT_IDS)[number];

export type MasonValidationRequirementPolicy = {
  id: MasonValidationRequirementId;
  description: string;
  aliases: readonly string[];
  githubChecks: readonly string[];
  milestoneSpecific?: boolean;
};

const POLICIES: readonly MasonValidationRequirementPolicy[] = [
  { id: "lint", description: "ESLint must pass", aliases: ["lint", "npm run lint"], githubChecks: ["lint"] },
  { id: "typecheck", description: "TypeScript typecheck must pass", aliases: ["typecheck", "npm run typecheck", "tsc --noemit"], githubChecks: ["typecheck"] },
  { id: "tests", description: "Unit/integration tests must pass", aliases: ["tests", "test", "npm test"], githubChecks: ["tests"] },
  { id: "i18n", description: "i18n parity must pass", aliases: ["i18n", "i18n:check", "npm run i18n:check"], githubChecks: ["i18n:check"] },
  { id: "build", description: "Build must pass", aliases: ["build", "npm run build"], githubChecks: ["build"] },
  {
    id: "launch_validation",
    description: "Launch validation must pass",
    aliases: ["launch validation", "launch_validation"],
    githubChecks: ["launch-validation"],
  },
  {
    id: "vercel",
    description: "Vercel deployment/status validation",
    aliases: ["vercel", "vercel preview"],
    githubChecks: ["vercel"],
  },
  {
    id: "vercel_preview_comments",
    description: "Vercel preview comments validation",
    aliases: ["vercel preview comments", "vercel_preview_comments"],
    githubChecks: ["vercel-preview-comments"],
  },
  {
    id: "milestone_7e_certification",
    description: "Milestone 7E certification checks",
    aliases: ["milestone 7e certification", "milestone_7e_certification"],
    githubChecks: ["milestone-7e-certification"],
    milestoneSpecific: true,
  },
] as const;

const byId = new Map<MasonValidationRequirementId, MasonValidationRequirementPolicy>(
  POLICIES.map((policy) => [policy.id, policy]),
);

const byAlias = new Map<string, MasonValidationRequirementId>();
for (const policy of POLICIES) {
  byAlias.set(policy.id, policy.id);
  for (const alias of policy.aliases) {
    byAlias.set(alias.trim().toLowerCase(), policy.id);
  }
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function defaultMasonValidationRequirements(): MasonValidationRequirementId[] {
  return ["lint", "typecheck", "tests", "i18n", "build"];
}

export function normalizeMasonValidationRequirements(
  requirements: readonly string[] | undefined,
): MasonValidationRequirementId[] {
  const selected = requirements && requirements.length > 0 ? requirements : defaultMasonValidationRequirements();
  const normalized = new Set<MasonValidationRequirementId>();
  for (const item of selected) {
    const alias = normalize(item);
    const mapped = byAlias.get(alias);
    if (!mapped) throw new Error(`mason_validation_requirement_untrusted:${item}`);
    normalized.add(mapped);
  }
  if (!normalized.size) {
    throw new Error("mason_validation_requirement_empty");
  }
  return [...normalized];
}

export function resolveMasonValidationPolicy(id: MasonValidationRequirementId): MasonValidationRequirementPolicy {
  const policy = byId.get(id);
  if (!policy) throw new Error(`mason_validation_policy_missing:${id}`);
  return policy;
}

export function getGithubCheckAliasesForRequirements(
  requirements: readonly MasonValidationRequirementId[],
): string[] {
  const aliases = new Set<string>();
  for (const requirement of requirements) {
    const policy = resolveMasonValidationPolicy(requirement);
    for (const check of policy.githubChecks) aliases.add(check);
  }
  return [...aliases];
}

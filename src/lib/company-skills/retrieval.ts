import "server-only";

import { listCompanySkills, type CompanySkill } from "@/lib/company-skills/library";
import { searchJuliusSemantic } from "@/lib/julius/service";
import type { AdaptiveExecutionPlan } from "@/lib/harmony/adaptive-planning";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";

export type CompanySkillRetrievalMode = "semantic" | "fallback";

export interface CompanySkillRetrievalContext {
  agent?: string | null;
  purpose?: string | null;
  organization?: OrganizationalIntelligence | null;
  adaptivePlan?: AdaptiveExecutionPlan | null;
}

export interface RankedCompanySkill {
  skill: CompanySkill;
  score: number;
  semanticSimilarity: number | null;
  reasons: string[];
  mode: CompanySkillRetrievalMode;
}

export interface CompanySkillRetrievalResult {
  mode: CompanySkillRetrievalMode;
  query: string;
  ranked: RankedCompanySkill[];
  skills: CompanySkill[];
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function terms(input: string): Set<string> {
  return new Set(normalize(input).split(" ").filter((term) => term.length > 3));
}

function daysSince(value: string | null): number {
  if (!value) return 365;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 365;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

function recencyScore(skill: CompanySkill): number {
  const days = Math.min(daysSince(skill.last_used ?? skill.updated_at), 365);
  return Math.max(0, 12 - days / 14);
}

function successScore(skill: CompanySkill): number {
  return Math.max(-8, Math.min(18, skill.success_count * 2 - skill.failure_count * 3));
}

function confidenceScore(skill: CompanySkill): number {
  return Math.max(0, Math.min(100, skill.confidence_score)) / 5;
}

function businessImpactScore(skill: CompanySkill, query: string): number {
  const text = normalize(
    `${query} ${skill.business_problem} ${skill.reusable_solution} ${skill.prerequisites.join(" ")} ${skill.when_to_use.join(" ")}`,
  );
  let score = 0;
  if (/revenue|customer|launch|production|security|risk|approval|payment/.test(text)) score += 8;
  if (/database|api|deployment|connector|integration|automation|workflow/.test(text)) score += 5;
  if (skill.approval_requirement === "required") score += 3;
  if (skill.approval_requirement === "recommended") score += 1.5;
  return score;
}

function organizationScore(skill: CompanySkill, context: CompanySkillRetrievalContext): number {
  const organization = context.organization;
  if (!organization) return 0;
  let score = 0;
  if (organization.strongestCollaboration?.agents.includes(skill.owner_agent)) score += 4;
  if (organization.highestPerformingCollaboration?.agents.includes(skill.owner_agent)) score += 5;
  if (organization.fastestImprovingMember?.agent === skill.owner_agent) score += 2;
  if (
    organization.mostEffectivePattern &&
    normalize(`${skill.title} ${skill.summary} ${skill.category}`).includes(
      normalize(organization.mostEffectivePattern.title),
    )
  ) {
    score += 3;
  }
  return score;
}

function adaptivePlanScore(skill: CompanySkill, context: CompanySkillRetrievalContext): number {
  const plan = context.adaptivePlan;
  if (!plan) return 0;
  let score = 0;
  if (plan.recommendedWorkforce.some((agent) => agent === skill.owner_agent)) score += 4;
  if (
    plan.phases.some(
      (phase) =>
        phase.recommendedAgent === skill.owner_agent ||
        normalize(`${phase.id} ${phase.title} ${phase.summary}`).includes(normalize(skill.category)),
    )
  ) {
    score += 4;
  }
  return score;
}

function tokenScore(skill: CompanySkill, query: string): { score: number; matches: string[] } {
  const queryTerms = terms(query);
  const haystack = normalize(
    `${skill.title} ${skill.category} ${skill.summary} ${skill.business_problem} ${skill.reusable_solution} ${skill.when_to_use.join(" ")}`,
  );
  const matches = [...queryTerms].filter((term) => haystack.includes(term));
  return {
    score: matches.length * 4,
    matches: matches.slice(0, 5),
  };
}

function rankSkill(params: {
  skill: CompanySkill;
  query: string;
  mode: CompanySkillRetrievalMode;
  semanticSimilarity?: number | null;
  context: CompanySkillRetrievalContext;
}): RankedCompanySkill {
  const { skill, query, mode, context } = params;
  const semanticSimilarity = params.semanticSimilarity ?? null;
  const semanticScore = semanticSimilarity == null ? 0 : semanticSimilarity * 45;
  const token = tokenScore(skill, query);
  const components = {
    semantic: semanticScore,
    token: token.score,
    confidence: confidenceScore(skill),
    success: successScore(skill),
    recency: recencyScore(skill),
    businessImpact: businessImpactScore(skill, query),
    organization: organizationScore(skill, context),
    adaptivePlan: adaptivePlanScore(skill, context),
  };
  const reasons = [
    semanticSimilarity == null ? null : `semantic similarity ${Math.round(semanticSimilarity * 100)}%`,
    token.matches.length > 0 ? `matched ${token.matches.join(", ")}` : null,
    `confidence ${skill.confidence_score}/100`,
    `${skill.success_count} success(es), ${skill.failure_count} failure(s)`,
    components.organization > 0 ? "supported by Organizational Intelligence" : null,
    components.adaptivePlan > 0 ? "aligned with Adaptive Planning context" : null,
    components.businessImpact > 0 ? "business-impact signal present" : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    skill,
    semanticSimilarity,
    mode,
    score: Number(Object.values(components).reduce((sum, value) => sum + value, 0).toFixed(2)),
    reasons,
  };
}

function uniqueRanked(ranked: RankedCompanySkill[]): RankedCompanySkill[] {
  const bySkill = new Map<string, RankedCompanySkill>();
  for (const candidate of ranked) {
    const prior = bySkill.get(candidate.skill.id);
    if (!prior || candidate.score > prior.score) bySkill.set(candidate.skill.id, candidate);
  }
  return [...bySkill.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.skill.confidence_score - a.skill.confidence_score ||
      b.skill.updated_at.localeCompare(a.skill.updated_at),
  );
}

export async function retrieveCompanySkills(params: {
  userId: string;
  companyId: string;
  query: string;
  limit?: number;
  context?: CompanySkillRetrievalContext;
}): Promise<CompanySkillRetrievalResult> {
  const query = params.query.trim();
  const limit = params.limit ?? 5;
  if (!query) {
    return { mode: "fallback", query, ranked: [], skills: [] };
  }

  const context = params.context ?? {};
  const allSkills = await listCompanySkills(params.userId, params.companyId, { limit: 300 });
  const skillsByEntry = new Map(allSkills.map((skill) => [skill.source_entry_id, skill]));
  const skillsById = new Map(allSkills.map((skill) => [skill.id, skill]));

  const semanticEntries = await searchJuliusSemantic(params.userId, params.companyId, query, Math.max(20, limit * 4));
  const semanticRanked = semanticEntries
    .map((entry) => skillsByEntry.get(entry.id) ?? skillsById.get(entry.id))
    .filter((skill): skill is CompanySkill => Boolean(skill))
    .map((skill) =>
      rankSkill({
        skill,
        query,
        mode: "semantic",
        semanticSimilarity:
          semanticEntries.find((entry) => entry.id === skill.source_entry_id || entry.id === skill.id)?.similarity ?? null,
        context,
      }),
    );

  const mode: CompanySkillRetrievalMode = semanticRanked.length > 0 ? "semantic" : "fallback";
  const fallbackRanked = allSkills.map((skill) =>
    rankSkill({
      skill,
      query,
      mode: "fallback",
      context,
    }),
  );
  const ranked = uniqueRanked([...(semanticRanked.length > 0 ? semanticRanked : []), ...fallbackRanked])
    .filter((candidate) => candidate.score > 0)
    .slice(0, limit);

  return {
    mode,
    query,
    ranked,
    skills: ranked.map((candidate) => candidate.skill),
  };
}

export function explainSemanticSkillSelection(ranked: RankedCompanySkill): string {
  return `${ranked.mode} score ${ranked.score}: ${ranked.reasons.join("; ") || "ranked by company skill strength"}`;
}

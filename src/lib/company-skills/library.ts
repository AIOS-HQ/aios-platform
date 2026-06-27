import "server-only";

import { emitActivity } from "@/lib/harmony/os/events";
import { listJuliusEntries, recordJuliusEntry, type JuliusEntry } from "@/lib/julius/service";
import { getAiosAgent } from "@/lib/workforce/registry";

export type SkillApprovalRequirement = "none" | "recommended" | "required";

export interface CompanySkill {
  id: string;
  title: string;
  owner_agent: string;
  category: string;
  summary: string;
  business_problem: string;
  reusable_solution: string;
  prerequisites: string[];
  when_to_use: string[];
  approval_requirement: SkillApprovalRequirement;
  confidence_score: number;
  success_count: number;
  failure_count: number;
  last_used: string | null;
  created_from_objective: string | null;
  updated_at: string;
  source_entry_id: string;
}

export interface SkillLearningEvent {
  userId: string;
  companyId: string | null;
  ownerAgent: string;
  title: string;
  summary?: string | null;
  outcome?: string | null;
  category?: string | null;
  objectiveId?: string | null;
  success: boolean;
  source: "work_item" | "agent_message" | "objective" | "manual";
  sourceId?: string | null;
}

const SKILL_REF_KIND = "company_skill";
const MAX_CONFIDENCE = 100;
const MIN_CONFIDENCE = 1;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function skillSignature(title: string, category: string): string {
  const words = normalize(title)
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .join("-");
  return `${normalize(category) || "general"}:${words || normalize(title).slice(0, 48)}`;
}

function inferCategory(event: SkillLearningEvent): string {
  const text = `${event.title} ${event.summary ?? ""} ${event.outcome ?? ""}`.toLowerCase();
  if (event.category) return event.category;
  if (/security|permission|token|secret|risk|credential/.test(text)) return "security";
  if (/content|campaign|blog|publish|seo|linkedin/.test(text)) return "growth";
  if (/customer|email|reply|message|conversation|support/.test(text)) return "communications";
  if (/audit|test|quality|lint|bug|failure/.test(text)) return "governance";
  if (/objective|strategy|roadmap|plan|priority/.test(text)) return "planning";
  if (/deploy|monitor|health|connector|supabase|vercel/.test(text)) return "operations";
  return getAiosAgent(event.ownerAgent)?.role.toLowerCase() ?? "operations";
}

function approvalRequirement(event: SkillLearningEvent): SkillApprovalRequirement {
  const text = `${event.title} ${event.summary ?? ""} ${event.outcome ?? ""}`.toLowerCase();
  if (/destructive|delete|secret|token|credential|payment|security/.test(text)) return "required";
  if (/approval|publish|customer|external|production/.test(text)) return "recommended";
  return "none";
}

function parseSkill(entry: JuliusEntry): CompanySkill | null {
  const refs = entry.refs as { kind?: string; skill?: Partial<CompanySkill> } | null;
  if (refs?.kind !== SKILL_REF_KIND || !refs.skill) return null;
  const skill = refs.skill;
  if (!skill.title || !skill.owner_agent || !skill.category) return null;
  return {
    id: String(skill.id ?? entry.id),
    title: String(skill.title),
    owner_agent: String(skill.owner_agent),
    category: String(skill.category),
    summary: String(skill.summary ?? ""),
    business_problem: String(skill.business_problem ?? ""),
    reusable_solution: String(skill.reusable_solution ?? entry.content),
    prerequisites: Array.isArray(skill.prerequisites) ? skill.prerequisites.map(String) : [],
    when_to_use: Array.isArray(skill.when_to_use) ? skill.when_to_use.map(String) : [],
    approval_requirement: (skill.approval_requirement as SkillApprovalRequirement) ?? "none",
    confidence_score: Number(skill.confidence_score ?? 50),
    success_count: Number(skill.success_count ?? 0),
    failure_count: Number(skill.failure_count ?? 0),
    last_used: skill.last_used ? String(skill.last_used) : null,
    created_from_objective: skill.created_from_objective ? String(skill.created_from_objective) : null,
    updated_at: String(skill.updated_at ?? entry.updated_at),
    source_entry_id: entry.id,
  };
}

function renderSkill(skill: CompanySkill): string {
  return [
    `Summary: ${skill.summary}`,
    `Business problem: ${skill.business_problem}`,
    `Reusable solution: ${skill.reusable_solution}`,
    `Prerequisites: ${skill.prerequisites.join("; ") || "None"}`,
    `When to use: ${skill.when_to_use.join("; ") || "When similar work appears"}`,
    `Approval requirement: ${skill.approval_requirement}`,
    `Confidence: ${skill.confidence_score}/100`,
    `Successes: ${skill.success_count}; failures: ${skill.failure_count}`,
  ].join("\n");
}

export async function listCompanySkills(
  userId: string,
  companyId: string,
  opts?: { limit?: number; query?: string; ownerAgent?: string },
): Promise<CompanySkill[]> {
  const entries = await listJuliusEntries(userId, companyId, {
    kind: "knowledge",
    query: opts?.query,
    limit: opts?.limit ?? 200,
  });
  const latestBySkill = new Map<string, CompanySkill>();
  for (const skill of entries
    .map(parseSkill)
    .filter((skill): skill is CompanySkill => Boolean(skill))
    .filter((skill) => !opts?.ownerAgent || skill.owner_agent === opts.ownerAgent)) {
    const prior = latestBySkill.get(skill.id);
    if (!prior || skill.updated_at > prior.updated_at) {
      latestBySkill.set(skill.id, skill);
    }
  }
  return [...latestBySkill.values()]
    .sort(
      (a, b) =>
        b.confidence_score - a.confidence_score ||
        b.success_count - a.success_count ||
        b.updated_at.localeCompare(a.updated_at),
    );
}

export async function findRelevantCompanySkills(
  userId: string,
  companyId: string,
  query: string,
  limit = 5,
): Promise<CompanySkill[]> {
  const { retrieveCompanySkills } = await import("@/lib/company-skills/retrieval");
  const result = await retrieveCompanySkills({ userId, companyId, query, limit });
  return result.skills;
}

export async function learnCompanySkill(event: SkillLearningEvent): Promise<CompanySkill | null> {
  if (!event.companyId) return null;
  const agent = getAiosAgent(event.ownerAgent);
  if (!agent) return null;

  const category = inferCategory(event);
  const signature = skillSignature(event.title, category);
  const now = new Date().toISOString();
  const existing = (await listCompanySkills(event.userId, event.companyId, { limit: 200 })).find(
    (skill) => skill.id === signature,
  );

  const delta = event.success ? 6 : -8;
  const next: CompanySkill = existing
    ? {
        ...existing,
        summary: event.summary?.trim() || existing.summary,
        reusable_solution: event.outcome?.trim() || existing.reusable_solution,
        confidence_score: Math.max(
          MIN_CONFIDENCE,
          Math.min(MAX_CONFIDENCE, existing.confidence_score + delta),
        ),
        success_count: existing.success_count + (event.success ? 1 : 0),
        failure_count: existing.failure_count + (event.success ? 0 : 1),
        last_used: now,
        updated_at: now,
      }
    : {
        id: signature,
        title: event.title.slice(0, 120),
        owner_agent: event.ownerAgent,
        category,
        summary:
          event.summary?.trim() ||
          `Reusable ${agent.name} process learned from ${event.source.replace("_", " ")}.`,
        business_problem: event.title.slice(0, 300),
        reusable_solution:
          event.outcome?.trim() ||
          event.summary?.trim() ||
          `Repeat the successful approach used by ${agent.name}; review source context before reuse.`,
        prerequisites: approvalRequirement(event) === "none" ? [] : ["Founder approval may be needed"],
        when_to_use: [`When similar ${category} work appears`, `When ${agent.name} owns related execution`],
        approval_requirement: approvalRequirement(event),
        confidence_score: event.success ? 56 : 42,
        success_count: event.success ? 1 : 0,
        failure_count: event.success ? 0 : 1,
        last_used: now,
        created_from_objective: event.objectiveId ?? null,
        updated_at: now,
        source_entry_id: "",
      };

  const saved = await recordJuliusEntry({
    userId: event.userId,
    companyId: event.companyId,
    agent: event.ownerAgent,
    kind: "knowledge",
    title: `${existing ? "Skill updated" : "Company Skill"} — ${next.title}`.slice(0, 300),
    content: renderSkill(next),
    importance: next.confidence_score >= 75 ? 5 : 4,
    refs: {
      kind: SKILL_REF_KIND,
      operation: existing ? "updated" : "created",
      signature,
      source: event.source,
      sourceId: event.sourceId ?? null,
      skill: next,
      previousEntryId: existing?.source_entry_id ?? null,
    },
  });
  if (!saved) return null;

  await emitActivity({
    userId: event.userId,
    companyId: event.companyId,
    actorType: "agent",
    actorId: event.ownerAgent,
    kind: "agent_action",
    summary: `${agent.name} ${existing ? "improved" : "created"} company skill: ${next.title}`.slice(0, 280),
    refType: "julius_entry",
    refId: saved.id,
  }).catch(() => {});

  return { ...next, source_entry_id: saved.id };
}

export function summarizeSkillMetrics(skills: CompanySkill[]) {
  const recentCutoff = Date.now() - 7 * 86_400_000;
  const recentlyLearned = skills.filter(
    (skill) => new Date(skill.updated_at).getTime() >= recentCutoff,
  ).length;
  const highestConfidence = skills[0]?.confidence_score ?? 0;
  const mostReused = [...skills].sort((a, b) => b.success_count - a.success_count)[0] ?? null;
  const domains = new Map<string, number>();
  for (const skill of skills) domains.set(skill.category, (domains.get(skill.category) ?? 0) + 1);
  const fastestGrowingDomain =
    [...domains.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    total: skills.length,
    recentlyLearned,
    highestConfidence,
    mostReused,
    fastestGrowingDomain,
  };
}

import "server-only";

import { emitActivity } from "@/lib/harmony/os/events";
import type { CompanySkill } from "@/lib/company-skills/library";
import {
  explainSemanticSkillSelection,
  retrieveCompanySkills,
  type CompanySkillRetrievalContext,
} from "@/lib/company-skills/retrieval";

export type SkillConsultationPurpose =
  | "objective_planning"
  | "work_item_generation"
  | "delegation"
  | "recommendation"
  | "execution";

export interface SkillUsageEvidence {
  id: string;
  title: string;
  owner_agent: string;
  category: string;
  confidence_score: number;
  success_count: number;
  failure_count: number;
  approval_requirement: CompanySkill["approval_requirement"];
  summary: string;
  reusable_solution: string;
  reason: string;
  source_entry_id: string;
}

export interface SkillConsultation {
  purpose: SkillConsultationPurpose;
  query: string;
  skills: SkillUsageEvidence[];
  summary: string;
  appliedAt: string;
  retrievalMode: "semantic" | "fallback";
}

function purposeLabel(purpose: SkillConsultationPurpose): string {
  return purpose.replace(/_/g, " ");
}

export function explainSkillSelection(skill: CompanySkill, query: string): string {
  const haystack = `${skill.title} ${skill.category} ${skill.summary} ${skill.when_to_use.join(" ")}`.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);
  const matches = [...new Set(terms.filter((term) => haystack.includes(term)))].slice(0, 4);
  const matchText = matches.length > 0 ? `matched ${matches.join(", ")}` : `fits ${skill.category}`;
  return `${matchText}; confidence ${skill.confidence_score}/100 after ${skill.success_count} success(es)`;
}

export function toSkillUsageEvidence(skill: CompanySkill, query: string): SkillUsageEvidence {
  return {
    id: skill.id,
    title: skill.title,
    owner_agent: skill.owner_agent,
    category: skill.category,
    confidence_score: skill.confidence_score,
    success_count: skill.success_count,
    failure_count: skill.failure_count,
    approval_requirement: skill.approval_requirement,
    summary: skill.summary,
    reusable_solution: skill.reusable_solution,
    reason: explainSkillSelection(skill, query),
    source_entry_id: skill.source_entry_id,
  };
}

export function summarizeSkillConsultation(skills: SkillUsageEvidence[]): string {
  if (skills.length === 0) return "No reusable Company Skills matched this decision.";
  const top = skills[0];
  const rest = skills.length > 1 ? ` plus ${skills.length - 1} related skill(s)` : "";
  return `Applied "${top.title}" (${top.confidence_score}/100 confidence, ${top.success_count} success(es))${rest}.`;
}

export function formatSkillContext(skills: SkillUsageEvidence[]): string {
  if (skills.length === 0) return "";
  return skills
    .map(
      (skill, index) =>
        `${index + 1}. ${skill.title} [${skill.owner_agent}, ${skill.confidence_score}/100]\n` +
        `   Why selected: ${skill.reason}\n` +
        `   Reusable solution: ${skill.reusable_solution}`,
    )
    .join("\n");
}

export function appendSkillContext(
  text: string | null | undefined,
  consultation: SkillConsultation,
): string | null {
  const context = formatSkillContext(consultation.skills);
  if (!context) return text ?? null;
  return `${text?.trim() ? `${text.trim()}\n\n` : ""}Company Skills consulted:\n${context}`;
}

export async function recordSkillConsultation(params: {
  userId: string;
  companyId: string | null;
  agent?: string | null;
  consultation: SkillConsultation;
  sourceType?: string | null;
  sourceId?: string | null;
}): Promise<void> {
  if (!params.companyId || params.consultation.skills.length === 0) return;
  const top = params.consultation.skills[0];
  await emitActivity({
    userId: params.userId,
    companyId: params.companyId,
    actorType: "agent",
    actorId: params.agent ?? top.owner_agent,
    kind: "agent_action",
    summary: `Applied ${params.consultation.skills.length} company skill(s) to ${purposeLabel(
      params.consultation.purpose,
    )}: ${top.title}`.slice(0, 280),
    refType: params.sourceType ?? "company_skill",
    refId: params.sourceId ?? top.source_entry_id,
  }).catch(() => {});
}

export async function consultCompanySkills(params: {
  userId: string;
  companyId: string | null;
  query: string;
  purpose: SkillConsultationPurpose;
  agent?: string | null;
  context?: CompanySkillRetrievalContext;
  sourceType?: string | null;
  sourceId?: string | null;
  limit?: number;
  emit?: boolean;
}): Promise<SkillConsultation> {
  const query = params.query.trim();
  const empty: SkillConsultation = {
    purpose: params.purpose,
    query,
    skills: [],
    summary: "No reusable Company Skills matched this decision.",
    appliedAt: new Date().toISOString(),
    retrievalMode: "fallback",
  };
  if (!params.companyId || !query) return empty;

  try {
    const retrieval = await retrieveCompanySkills({
      userId: params.userId,
      companyId: params.companyId,
      query,
      limit: params.limit ?? 4,
      context: {
        ...params.context,
        agent: params.agent ?? params.context?.agent,
        purpose: params.purpose,
      },
    });
    const rankedById = new Map(retrieval.ranked.map((ranked) => [ranked.skill.id, ranked]));
    const skills = retrieval.skills.map((skill) => {
      const evidence = toSkillUsageEvidence(skill, query);
      const ranked = rankedById.get(skill.id);
      return ranked
        ? {
            ...evidence,
            reason: explainSemanticSkillSelection(ranked),
          }
        : evidence;
    });
    const consultation: SkillConsultation = {
      purpose: params.purpose,
      query,
      skills,
      summary: summarizeSkillConsultation(skills),
      appliedAt: new Date().toISOString(),
      retrievalMode: retrieval.mode,
    };

    if (params.emit !== false) {
      await recordSkillConsultation({
        userId: params.userId,
        companyId: params.companyId,
        agent: params.agent,
        consultation,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      });
    }

    return consultation;
  } catch (e) {
    console.error("[company-skills/utilization] consult", e);
    return empty;
  }
}

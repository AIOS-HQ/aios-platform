import "server-only";

import { createClient } from "@/lib/supabase/server";
import { learnCompanySkill, type CompanySkill } from "@/lib/company-skills/library";

/**
 * Self-Improving Skills (Foundation 3) — clarification-pattern miner.
 *
 * Turns repeated clarifications into reusable company skills: when a worker
 * keeps pausing for the SAME missing inputs, that recurring gap is a learnable
 * pattern. The miner reads resolved clarifications, groups by (worker + missing
 * inputs), and — above a threshold — proposes a skill through the EXISTING
 * company-skills system (`learnCompanySkill`), which scores/versions it and
 * keeps it company-private. Nothing is published organization-wide here; that
 * remains a Founder-gated action (future Skills Marketplace).
 *
 * Additive + inert: exposed as explicit entry points; no automatic production
 * caller invokes it yet (auto-mining on resolve is a later, gated increment).
 */

interface ClarificationRow {
  worker: string;
  explainability: Record<string, unknown> | null;
  resume_payload: Record<string, unknown> | null;
}

export interface ClarificationPattern {
  worker: string;
  missingInputs: string[];
  occurrences: number;
  exampleObjective: string;
}

function missingInputsOf(explainability: Record<string, unknown> | null): string[] {
  const raw = explainability?.missingInputs;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean).sort();
}

/** Group resolved clarifications by (worker + missing inputs) into recurring patterns. */
export async function mineClarificationPatterns(
  userId: string,
  companyId: string,
): Promise<ClarificationPattern[]> {
  if (!userId || !companyId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clarification_requests")
    .select("worker,explainability,resume_payload")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "resolved")
    .limit(500);
  if (error) {
    console.error("[skills/clarification-miner] read", error.message);
    return [];
  }

  const rows = (data as unknown as ClarificationRow[] | null) ?? [];
  const groups = new Map<string, ClarificationPattern>();
  for (const row of rows) {
    const missing = missingInputsOf(row.explainability);
    if (!missing.length) continue;
    const key = `${row.worker}::${missing.join(",")}`;
    const objective =
      typeof row.resume_payload?.objective === "string" ? row.resume_payload.objective : "";
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.exampleObjective && objective) existing.exampleObjective = objective;
    } else {
      groups.set(key, { worker: row.worker, missingInputs: missing, occurrences: 1, exampleObjective: objective });
    }
  }
  return [...groups.values()].sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Propose company skills from recurring clarification patterns (>= minOccurrences).
 * Each becomes a "capture X upfront" skill via the existing scoring/versioning
 * system. Company-private; Founder approval gates any future org-wide publish.
 */
export async function proposeSkillsFromClarifications(args: {
  userId: string;
  companyId: string;
  minOccurrences?: number;
}): Promise<CompanySkill[]> {
  const min = args.minOccurrences ?? 3;
  const patterns = (await mineClarificationPatterns(args.userId, args.companyId)).filter(
    (p) => p.occurrences >= min,
  );

  const created: CompanySkill[] = [];
  for (const pattern of patterns) {
    const inputs = pattern.missingInputs.join(", ");
    const skill = await learnCompanySkill({
      userId: args.userId,
      companyId: args.companyId,
      ownerAgent: pattern.worker,
      title: `Proactively capture ${inputs} before ${pattern.worker} execution`,
      summary: `${pattern.worker} paused ${pattern.occurrences}× needing: ${inputs}. Capturing these upfront avoids repeated clarification.`,
      outcome: `Before executing (e.g. "${pattern.exampleObjective || "a business request"}"), ensure ${inputs} are present in the Company Context Envelope or the request; only ask when still missing.`,
      category: "planning",
      success: true,
      source: "manual",
    });
    if (skill) created.push(skill);
  }
  return created;
}

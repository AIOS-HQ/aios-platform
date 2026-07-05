import "server-only";

import { getEnvelope, deriveWorkerContext } from "@/lib/company/envelope";

/**
 * Envelope-driven reasoning (Foundation 2, Law 5): render the company's
 * Context Envelope into a compact prompt block a worker prepends to its system
 * prompt, so it reasons from organizational context — vision, mission, values,
 * objectives, priorities, policies, operating rules — rather than isolated
 * prompts. Fail-open: returns "" when there is no envelope or on any error, so
 * Harmony never regresses to a worse prompt than before.
 */
export async function buildEnvelopePromptContext(companyId: string, worker = "harmony"): Promise<string> {
  try {
    const envelope = await getEnvelope(companyId);
    if (!envelope) return "";
    const ctx = deriveWorkerContext(envelope, worker);

    const lines: string[] = [];
    const identity = [ctx.companyName, ctx.industry].filter(Boolean).join(" · ");
    if (identity) lines.push(identity);
    if (ctx.vision) lines.push(`Vision: ${ctx.vision}`);
    if (ctx.mission) lines.push(`Mission: ${ctx.mission}`);
    if (ctx.coreValues.length) lines.push(`Core values: ${ctx.coreValues.slice(0, 8).join(", ")}`);

    const objectives = ctx.objectives.slice(0, 5).map((o) => `- ${o.title}`);
    if (objectives.length) lines.push(`Objectives:\n${objectives.join("\n")}`);

    const priorities = ctx.priorities.slice(0, 5).map((p) => `- ${p.title}`);
    if (priorities.length) lines.push(`Priorities:\n${priorities.join("\n")}`);

    const rules = ctx.operatingRules
      .filter((r): r is string => typeof r === "string")
      .slice(0, 6)
      .map((r) => `- ${r}`);
    if (rules.length) lines.push(`Operating rules:\n${rules.join("\n")}`);

    if (!lines.length) return "";
    return [
      "Company Context (from the AIOS Company Context Envelope — reason from this, don't assume):",
      ...lines,
    ].join("\n");
  } catch (e) {
    console.error("[harmony/envelope-context] buildEnvelopePromptContext", e);
    return "";
  }
}

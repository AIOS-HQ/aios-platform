import "server-only";

import { learnCompanySkill } from "@/lib/company-skills/library";
import { writeVerifiedJuliusOutcome, type JuliusWritebackInput } from "@/lib/julius/writeback";

/**
 * Canonical learning boundary for Mason executions.
 * Julius owns verified execution history. Company Skills stores only a reusable
 * practice derived from a successfully verified Julius outcome.
 */
export async function recordMasonEngineeringLearning(input: {
  julius: JuliusWritebackInput;
  userId: string;
  companyId: string;
  executionId: string;
  successful: boolean;
  summary: string;
}) {
  const julius = await writeVerifiedJuliusOutcome(input.julius);
  const juliusVerified = julius.status === "written" || julius.status === "deduplicated";
  const companySkill = input.successful && juliusVerified
    ? await learnCompanySkill({
        userId: input.userId,
        companyId: input.companyId,
        ownerAgent: "mason",
        title: "Verified Mason engineering execution",
        summary: input.summary,
        outcome: `Reuse only with a verified engineering task and execution ${input.executionId}.`,
        category: "engineering",
        success: true,
        source: "manual",
        sourceId: input.executionId,
      })
    : null;

  return { julius, companySkill };
}

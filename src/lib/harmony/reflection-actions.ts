"use server";

import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import {
  buildHarmonyReflection,
  recordHarmonyReflection,
  type HarmonyReflection,
} from "@/lib/harmony/reflection";

/**
 * Reflect and enrich Julius: recompute Harmony's reflection from real work,
 * persist one consolidated reflection to the org brain (deduped per day), and
 * return the fresh reflection + how many entries were written. Human in the
 * loop — invoked when the founder asks Harmony to reflect. Personal-only users
 * (no company) get a no-op empty reflection.
 */
export async function runHarmonyReflection(): Promise<{
  reflection: HarmonyReflection;
  saved: number;
}> {
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) {
    return {
      reflection: {
        hasData: false,
        generatedAt: new Date().toISOString(),
        insights: [],
        stats: { done: 0, blocked: 0, delegations: 0, pendingApprovals: 0, lessons: 0 },
      },
      saved: 0,
    };
  }
  const reflection = await buildHarmonyReflection(user.id, companyId);
  const saved = await recordHarmonyReflection(user.id, companyId, reflection);
  return { reflection, saved };
}

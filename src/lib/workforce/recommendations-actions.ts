"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { setRecommendationStatus, type RecommendationStatus } from "@/lib/workforce/recommendations";
import { emitActivity } from "@/lib/harmony/os/events";
import type { ActionState } from "@/lib/types";

const OP_STATUS: Record<string, RecommendationStatus> = {
  accept: "accepted",
  dismiss: "dismissed",
};

/**
 * Founder accept/dismiss for agent recommendations. Advisory — accepting records
 * the decision and logs activity; it does not execute anything.
 */
export async function recommendationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const op = String(formData.get("op") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = OP_STATUS[op];
  if (!status || !id) return { status: "error", message: t("errors.generic") };

  const ok = await setRecommendationStatus(user.id, id, status);
  if (!ok) return { status: "error", message: t("errors.generic") };

  const companyId = await resolvePrimaryCompanyId();
  await emitActivity({
    userId: user.id,
    companyId,
    actorType: "founder",
    kind: "agent_action",
    summary: op === "accept" ? "Accepted an agent recommendation" : "Dismissed an agent recommendation",
    refType: "agent_recommendation",
    refId: id,
  });

  const agent = String(formData.get("agent") ?? "");
  if (agent) revalidatePath(`/harmony/workforce/${agent}`);
  revalidatePath("/harmony/review");
  return { status: "success", message: "" };
}

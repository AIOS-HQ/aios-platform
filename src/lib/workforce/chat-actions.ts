"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { sendAgentChat } from "@/lib/workforce/chat";
import { getAiosAgent } from "@/lib/workforce/registry";
import { handleMasonEngineeringMessage } from "@/lib/workforce/mason-action";
import { masonFounderApproved } from "@/lib/workforce/mason-approval";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";

/** Founder sends a message to an AIOS agent; Mason messages enter the engineering runtime path. */
export async function sendAgentChatAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const agent = String(formData.get("agent") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  if (!getAiosAgent(agent)) return { status: "error", message: t("errors.generic") };
  if (!message) return { status: "error", message: t("errors.generic") };
  if (exceedsLimits([[message, LIMITS.noteContent]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const companyId = await resolvePrimaryCompanyId();
  if (agent === "mason") {
    const result = await handleMasonEngineeringMessage({
      userId: user.id,
      message,
      founderApproved: masonFounderApproved(formData.get("founder_approved") ?? message),
    });
    await sendAgentChat({ userId: user.id, companyId, agent, message: `${message}\n\nMason runtime: ${result.status}. ${result.summary}` });
    revalidatePath(`/harmony/workforce/${agent}`);
    return { status: result.status === "failed" ? "error" : "success", message: result.status === "failed" ? result.summary : "" };
  }

  const ok = await sendAgentChat({ userId: user.id, companyId, agent, message });
  if (!ok) return { status: "error", message: t("errors.generic") };

  revalidatePath(`/harmony/workforce/${agent}`);
  return { status: "success", message: "" };
}

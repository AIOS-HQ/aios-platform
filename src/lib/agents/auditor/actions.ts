"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";
import { runGovernanceSweep } from "@/lib/agents/auditor/service";

/**
 * Auditor governance pass: record the current audit posture to the org brain
 * (Julius), open remediation work items for risk findings, and escalate them
 * through the Activity trail. Owner-scoped. Bound to the existing audit button.
 */
export async function recordAuditToJuliusAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auditor");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const result = await runGovernanceSweep(user.id);
  if (!result.ok) return { status: "error", message: t("errors.juliusFailed") };

  revalidatePath("/settings/auditor");
  return { status: "success", message: t("recordedToast") };
}

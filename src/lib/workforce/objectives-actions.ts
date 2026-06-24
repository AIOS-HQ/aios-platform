"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import {
  createObjective,
  setObjectiveStatus,
  type ObjectivePriority,
  type ObjectiveStatus,
} from "@/lib/workforce/objectives";
import { exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";

const TITLE_MAX = 300;

const PRIORITIES: ObjectivePriority[] = ["low", "medium", "high"];

/** Map a UI op to the resulting objective status (founder-driven transitions). */
const OP_STATUS: Record<string, ObjectiveStatus> = {
  promote: "active",
  pause: "paused",
  done: "done",
  dismiss: "dismissed",
};

/**
 * Founder controls for agent objectives: create one, or transition an existing
 * one (promote / pause / done / dismiss). Advisory — no autonomous execution.
 */
export async function objectiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const op = String(formData.get("op") ?? "");
  const agent = String(formData.get("agent") ?? "");

  if (!getAiosAgent(agent)) return { status: "error", message: t("errors.generic") };

  if (op === "create") {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { status: "error", message: t("errors.generic") };
    if (exceedsLimits([[title, TITLE_MAX]])) {
      return { status: "error", message: t("errors.tooLong") };
    }
    const priorityRaw = String(formData.get("priority") ?? "medium");
    const priority = (PRIORITIES as string[]).includes(priorityRaw)
      ? (priorityRaw as ObjectivePriority)
      : "medium";
    const companyId = await resolvePrimaryCompanyId();
    const created = await createObjective({
      userId: user.id,
      companyId,
      agent,
      title,
      priority,
      origin: "founder",
    });
    if (!created) return { status: "error", message: t("errors.generic") };
    revalidatePath(`/harmony/workforce/${agent}`);
    revalidatePath("/harmony/review");
    return { status: "success", message: "" };
  }

  const status = OP_STATUS[op];
  const id = String(formData.get("id") ?? "");
  if (!status || !id) return { status: "error", message: t("errors.generic") };
  const ok = await setObjectiveStatus(user.id, id, status);
  if (!ok) return { status: "error", message: t("errors.generic") };
  revalidatePath(`/harmony/workforce/${agent}`);
  return { status: "success", message: "" };
}

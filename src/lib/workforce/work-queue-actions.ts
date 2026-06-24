"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import {
  createWorkItem,
  setWorkItemStatus,
  getWorkItem,
  type WorkKind,
  type WorkRisk,
} from "@/lib/workforce/work-queue";
import { delegateTask } from "@/lib/harmony/agents/a2a";
import { exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";

const TITLE_MAX = 300;
const KINDS: WorkKind[] = ["task", "message", "review"];
const RISKS: WorkRisk[] = ["routine", "approval", "destructive"];

/**
 * Founder controls for the work queue: create an item, approve (advisory),
 * dismiss, or "approve & delegate". Delegation routes through the existing A2A
 * path (Harmony → the assigned agent); risky/destructive items therefore create
 * an Approval Center entry and wait for the founder. Nothing auto-executes.
 */
export async function workItemAction(
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
    const riskRaw = String(formData.get("risk") ?? "routine");
    const risk = (RISKS as string[]).includes(riskRaw) ? (riskRaw as WorkRisk) : "routine";
    const kindRaw = String(formData.get("kind") ?? "task");
    const kind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as WorkKind) : "task";
    const companyId = await resolvePrimaryCompanyId();
    const created = await createWorkItem({ userId: user.id, companyId, agent, title, risk, kind });
    if (!created) return { status: "error", message: t("errors.generic") };
    revalidatePath("/harmony/work");
    revalidatePath("/harmony/review");
    return { status: "success", message: "" };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: t("errors.generic") };

  if (op === "dismiss") {
    const ok = await setWorkItemStatus(user.id, id, "dismissed");
    if (!ok) return { status: "error", message: t("errors.generic") };
    revalidatePath("/harmony/work");
    revalidatePath("/harmony/review");
    return { status: "success", message: "" };
  }

  if (op === "approve") {
    const ok = await setWorkItemStatus(user.id, id, "approved");
    if (!ok) return { status: "error", message: t("errors.generic") };
    revalidatePath("/harmony/work");
    revalidatePath("/harmony/review");
    return { status: "success", message: "" };
  }

  if (op === "delegate") {
    // Use the item's REAL risk from the DB (never a client-supplied value), so
    // risky/destructive work cannot bypass the Approval Center.
    const item = await getWorkItem(user.id, id);
    if (!item) return { status: "error", message: t("errors.generic") };
    const companyId = await resolvePrimaryCompanyId();
    if (!companyId) return { status: "error", message: t("errors.generic") };
    const delegated = await delegateTask({
      userId: user.id,
      companyId,
      fromAgent: "harmony",
      toAgent: item.agent,
      subject: item.title,
      body: item.detail ?? undefined,
      risk: item.risk,
    });
    if (!delegated) return { status: "error", message: t("errors.generic") };
    await setWorkItemStatus(user.id, id, "approved");
    revalidatePath("/harmony/work");
    revalidatePath("/harmony/review");
    return { status: "success", message: "" };
  }

  return { status: "error", message: t("errors.generic") };
}

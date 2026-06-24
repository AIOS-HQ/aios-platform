"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import {
  sendAgentMessage,
  respondToTask,
  type AgentMessageKind,
  type AgentMessageRisk,
} from "@/lib/harmony/agents/a2a";
import { getAiosAgent } from "@/lib/workforce/registry";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";

const KINDS: AgentMessageKind[] = ["message", "task"];
const RISKS: AgentMessageRisk[] = ["routine", "approval", "destructive"];

/**
 * Harmony Dispatch — create an agent-to-agent message/task from the UI. Julius
 * context is attached by the backend (sendAgentMessage); risky/write tasks are
 * routed to the Approval Center automatically. Owner-scoped + company-scoped.
 */
export async function dispatchAgentTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const tw = await getTranslations("workforce");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return { status: "error", message: tw("dispatchNoCompany") };

  const fromAgent = String(formData.get("from_agent") ?? "harmony");
  const toAgent = String(formData.get("to_agent") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "task") as AgentMessageKind;
  const riskRaw = String(formData.get("risk") ?? "routine") as AgentMessageRisk;
  const kind: AgentMessageKind = KINDS.includes(kindRaw) ? kindRaw : "task";
  const risk: AgentMessageRisk = RISKS.includes(riskRaw) ? riskRaw : "routine";

  if (!subject) return { status: "error", message: t("errors.titleRequired") };
  if (fromAgent === toAgent)
    return { status: "error", message: tw("dispatchSameAgent") };
  if (!getAiosAgent(fromAgent) || !getAiosAgent(toAgent))
    return { status: "error", message: t("errors.generic") };
  if (exceedsLimits([[subject, LIMITS.title], [body, LIMITS.description]]))
    return { status: "error", message: t("errors.tooLong") };

  const msg = await sendAgentMessage({
    userId: user.id,
    companyId,
    fromAgent,
    toAgent,
    subject,
    body,
    kind,
    risk,
  });
  if (!msg) return { status: "error", message: t("errors.generic") };

  revalidatePath("/harmony/workforce");
  revalidatePath("/harmony");
  return {
    status: "success",
    message: msg.status === "awaiting_approval" ? tw("dispatchedGated") : tw("dispatched"),
  };
}

/** Record a response/outcome for a delegated task (closes it + writes to Julius). */
export async function respondAgentTask(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return;
  const parentId = String(formData.get("parent_id") ?? "");
  const fromAgent = String(formData.get("from_agent") ?? "");
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!parentId || !outcome || !getAiosAgent(fromAgent)) return;

  await respondToTask({ userId: user.id, companyId, parentId, fromAgent, outcome });
  revalidatePath("/harmony/workforce");
}

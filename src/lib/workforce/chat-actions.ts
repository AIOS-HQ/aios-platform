"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { recordAgentChatExchange, sendAgentChat } from "@/lib/workforce/chat";
import { getAiosAgent } from "@/lib/workforce/registry";
import { handleMasonEngineeringMessage } from "@/lib/workforce/mason-action";
import { masonFounderApproved } from "@/lib/workforce/mason-approval";
import {
  createMasonChatCorrelationId,
  logMasonChatFailure,
  logMasonChatPhase,
  type MasonChatDiagnosticPhase,
} from "@/lib/workforce/chat-diagnostics";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";

function isReadOnlyMasonConversation(message: string): boolean {
  const text = message.toLowerCase();
  const readOnlySignals = [
    /\brespond\s+only\b/,
    /\backnowledge\b/,
    /\bexplain\b/,
    /\bstatus\b/,
    /\bhealth\b/,
    /\bread[- ]?only\b/,
    /\bdiagnostic\s+only\b/,
    /\bdo\s+not\s+execute\b/,
    /\bdo\s+not\s+use\s+tools\b/,
    /\bdo\s+not\s+deploy\b/,
  ];

  const mutationSignals = [
    /\bdeploy\s+to\s+production\b/,
    /\bcreate\s+(?:a\s+)?branch\b/,
    /\bopen\s+(?:a\s+)?(?:pr|pull\s+request)\b/,
    /\bcommit\b/,
    /\bmerge\b/,
    /\bmodify\s+code\b/,
    /\bedit\s+file\b/,
    /\bwrite\s+code\b/,
  ];

  return readOnlySignals.some((pattern) => pattern.test(text))
    && !mutationSignals.some((pattern) => pattern.test(text));
}

/** Founder sends a message to an AIOS agent; Mason messages enter the engineering runtime path. */
export async function sendAgentChatAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const correlationId = createMasonChatCorrelationId();
  let currentPhase: MasonChatDiagnosticPhase = "mason_chat_server_entered";

  const t = await getTranslations("harmony");
  const agent = String(formData.get("agent") ?? "");
  const message = String(formData.get("message") ?? "").trim();

  let userId: string | null = null;
  let companyId: string | null = null;
  let executionId: string | null = null;

  try {
    const user = await requireUser();
    userId = user.id;

    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
      agentKey: agent,
      functionName: "sendAgentChatAction",
      selectedPath: "pending",
    });

    currentPhase = "mason_chat_agent_resolved";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
      agentKey: agent,
      functionName: "sendAgentChatAction",
      selectedPath: "pending",
    });

    if (!getAiosAgent(agent)) return { status: "error", message: t("errors.generic") };
    if (!message) return { status: "error", message: t("errors.generic") };
    if (exceedsLimits([[message, LIMITS.noteContent]])) {
      return { status: "error", message: t("errors.tooLong") };
    }

    companyId = await resolvePrimaryCompanyId();
    currentPhase = "mason_chat_company_resolved";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
      agentKey: agent,
      functionName: "sendAgentChatAction",
      selectedPath: "pending",
    });

    if (agent === "mason") {
      const readOnly = isReadOnlyMasonConversation(message);
      await logMasonChatPhase("mason_chat_readonly_guard_evaluated", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        readonlyGuardResult: readOnly,
        functionName: "isReadOnlyMasonConversation",
      });

      const intentCategory = readOnly ? "conversation_read_only" : "engineering_mutation";
      await logMasonChatPhase("mason_chat_intent_classified", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: readOnly,
        functionName: "sendAgentChatAction",
      });

      if (readOnly) {
        await logMasonChatPhase("mason_chat_path_selected", {
          correlationId,
          userId,
          companyId,
          executionId,
          agentKey: agent,
          intentCategory,
          readonlyGuardResult: true,
          selectedPath: "conversation",
          functionName: "sendAgentChatAction",
        });

        const ok = await recordAgentChatExchange({
          userId,
          companyId,
          agent,
          userMessage: message,
          assistantMessage: "Mason runtime operational.",
          refs: { conversation_mode: "read_only", correlationId },
        });
        if (!ok) return { status: "error", message: t("errors.generic") };

        currentPhase = "mason_chat_response_returned";
        await logMasonChatPhase(currentPhase, {
          correlationId,
          userId,
          companyId,
          executionId,
          agentKey: agent,
          intentCategory,
          readonlyGuardResult: true,
          selectedPath: "conversation",
          functionName: "sendAgentChatAction",
        }, {
          actionStatus: "success",
        });

        revalidatePath(`/harmony/workforce/${agent}`);

        return { status: "success", message: "" };
      }

      const founderApproved = masonFounderApproved(formData.get("founder_approved") ?? message);

      await logMasonChatPhase("mason_chat_path_selected", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: false,
        selectedPath: "engineering_execution",
        functionName: "sendAgentChatAction",
      });

      await logMasonChatPhase("mason_chat_engineering_handler_called", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: false,
        selectedPath: "engineering_execution",
        functionName: "handleMasonEngineeringMessage",
      });

      const result = await handleMasonEngineeringMessage({
        userId,
        companyId,
        message,
        founderApproved,
      });

      executionId =
        typeof result.diagnostics?.retrievalExecutionId === "string"
          ? result.diagnostics.retrievalExecutionId
          : null;

      await logMasonChatPhase("mason_chat_runtime_called", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: false,
        selectedPath: "engineering_execution",
        functionName: "runMasonProductionRuntime",
      });
      await logMasonChatPhase("mason_chat_approval_result_received", {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: false,
        selectedPath: "engineering_execution",
        approvalId: result.summary.match(/Approval ID:\s*([^\.\s]+)/i)?.[1] ?? null,
        functionName: "determineMasonExecutionReadiness",
      }, {
        masonStatus: result.status,
        retrievalStatus: result.diagnostics?.retrievalStatus,
      });

      const ok = await recordAgentChatExchange({
        userId,
        companyId,
        agent,
        userMessage: message,
        assistantMessage: `Mason runtime: ${result.status}.\n${result.summary}`,
        refs: { runtime: result, correlationId },
      });
      if (!ok) return { status: "error", message: t("errors.generic") };

      currentPhase = "mason_chat_response_returned";
      await logMasonChatPhase(currentPhase, {
        correlationId,
        userId,
        companyId,
        executionId,
        agentKey: agent,
        intentCategory,
        readonlyGuardResult: false,
        selectedPath: "engineering_execution",
        approvalId: result.summary.match(/Approval ID:\s*([^\.\s]+)/i)?.[1] ?? null,
        functionName: "sendAgentChatAction",
      }, {
        actionStatus: result.status === "failed" || (result.status === "blocked" && !founderApproved) ? "error" : "success",
      });

      const isTerminalFailure = result.status === "failed";
      const isBlockedAwaitingApproval = result.status === "blocked" && !founderApproved;

      revalidatePath(`/harmony/workforce/${agent}`);

      return {
        status: isTerminalFailure || isBlockedAwaitingApproval ? "error" : "success",
        message:
          isTerminalFailure || isBlockedAwaitingApproval
            ? `${result.summary} (ref: ${correlationId})`
            : "",
      };
    }

    const ok = await sendAgentChat({ userId, companyId, agent, message });
    if (!ok) return { status: "error", message: t("errors.generic") };

    currentPhase = "mason_chat_response_returned";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
      agentKey: agent,
      intentCategory: "non_mason_chat",
      selectedPath: "conversation",
      functionName: "sendAgentChatAction",
    }, {
      actionStatus: "success",
    });

    revalidatePath(`/harmony/workforce/${agent}`);

    return { status: "success", message: "" };
  } catch (error) {
    await logMasonChatFailure(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
      agentKey: agent,
      functionName: "sendAgentChatAction",
    }, error);

    throw error;
  }
}

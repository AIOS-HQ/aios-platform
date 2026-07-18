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
  let currentPhase: MasonChatDiagnosticPhase = "chat_submit_started";

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
    });

    currentPhase = "auth_resolved";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
    });

    if (!getAiosAgent(agent)) return { status: "error", message: t("errors.generic") };
    if (!message) return { status: "error", message: t("errors.generic") };
    if (exceedsLimits([[message, LIMITS.noteContent]])) {
      return { status: "error", message: t("errors.tooLong") };
    }

    companyId = await resolvePrimaryCompanyId();
    currentPhase = "company_resolved";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
    });

    if (agent === "mason") {
      if (isReadOnlyMasonConversation(message)) {
        const ok = await recordAgentChatExchange({
          userId,
          companyId,
          agent,
          userMessage: message,
          assistantMessage: "Mason runtime operational.",
          refs: { conversation_mode: "read_only", correlationId },
        });
        if (!ok) return { status: "error", message: t("errors.generic") };

        currentPhase = "conversation_resolved";
        await logMasonChatPhase(currentPhase, {
          correlationId,
          userId,
          companyId,
          executionId,
        });
        await logMasonChatPhase("user_message_persisted", {
          correlationId,
          userId,
          companyId,
          executionId,
        });
        await logMasonChatPhase("assistant_message_persisted", {
          correlationId,
          userId,
          companyId,
          executionId,
        });

        currentPhase = "revalidation_started";
        await logMasonChatPhase(currentPhase, {
          correlationId,
          userId,
          companyId,
          executionId,
        });
        revalidatePath(`/harmony/workforce/${agent}`);
        await logMasonChatPhase("revalidation_completed", {
          correlationId,
          userId,
          companyId,
          executionId,
        });

        await logMasonChatPhase("chat_submit_completed", {
          correlationId,
          userId,
          companyId,
          executionId,
        }, {
          actionStatus: "success",
        });

        return { status: "success", message: "" };
      }

      const founderApproved = masonFounderApproved(formData.get("founder_approved") ?? message);

      currentPhase = "mason_entry_started";
      await logMasonChatPhase(currentPhase, {
        correlationId,
        userId,
        companyId,
        executionId,
      });

      await logMasonChatPhase("julius_retrieval_started", {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      await logMasonChatPhase("ledger_snapshot_started", {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      await logMasonChatPhase("event_mesh_started", {
        correlationId,
        userId,
        companyId,
        executionId,
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

      await logMasonChatPhase("julius_retrieval_completed", {
        correlationId,
        userId,
        companyId,
        executionId,
      }, {
        retrievalStatus: result.diagnostics?.retrievalStatus,
      });
      await logMasonChatPhase("ledger_snapshot_completed", {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      await logMasonChatPhase("event_mesh_completed", {
        correlationId,
        userId,
        companyId,
        executionId,
      });

      currentPhase = "mason_entry_completed";
      await logMasonChatPhase(currentPhase, {
        correlationId,
        userId,
        companyId,
        executionId,
      }, {
        masonStatus: result.status,
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

      currentPhase = "conversation_resolved";
      await logMasonChatPhase(currentPhase, {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      await logMasonChatPhase("user_message_persisted", {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      await logMasonChatPhase("assistant_message_persisted", {
        correlationId,
        userId,
        companyId,
        executionId,
      });

      currentPhase = "revalidation_started";
      await logMasonChatPhase(currentPhase, {
        correlationId,
        userId,
        companyId,
        executionId,
      });
      revalidatePath(`/harmony/workforce/${agent}`);
      await logMasonChatPhase("revalidation_completed", {
        correlationId,
        userId,
        companyId,
        executionId,
      });

      const isTerminalFailure = result.status === "failed";
      const isBlockedAwaitingApproval = result.status === "blocked" && !founderApproved;

      await logMasonChatPhase("chat_submit_completed", {
        correlationId,
        userId,
        companyId,
        executionId,
      }, {
        actionStatus: isTerminalFailure || isBlockedAwaitingApproval ? "error" : "success",
      });

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

    currentPhase = "conversation_resolved";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
    });
    await logMasonChatPhase("user_message_persisted", {
      correlationId,
      userId,
      companyId,
      executionId,
    });

    currentPhase = "revalidation_started";
    await logMasonChatPhase(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
    });
    revalidatePath(`/harmony/workforce/${agent}`);
    await logMasonChatPhase("revalidation_completed", {
      correlationId,
      userId,
      companyId,
      executionId,
    });

    await logMasonChatPhase("chat_submit_completed", {
      correlationId,
      userId,
      companyId,
      executionId,
    }, {
      actionStatus: "success",
    });

    return { status: "success", message: "" };
  } catch (error) {
    await logMasonChatFailure(currentPhase, {
      correlationId,
      userId,
      companyId,
      executionId,
    }, error);

    throw error;
  }
}

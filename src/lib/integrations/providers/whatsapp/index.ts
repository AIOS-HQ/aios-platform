import "server-only";

import { createHash } from "node:crypto";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isWithinWhatsAppServiceWindow,
  listWhatsAppTemplates,
  sendWhatsAppMedia,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  verifyWhatsAppBusinessAccount,
  verifyWhatsAppPhoneNumber,
} from "./client";

type MessageType = "text" | "template" | "image" | "document" | "audio" | "video";

interface GovernedSendInput {
  to: string;
  conversationId?: string;
  companyId?: string;
  approvalId?: string;
  idempotencyKey?: string;
  lastInboundAt?: string | null;
  optedOut?: boolean;
}

interface TextInput extends GovernedSendInput {
  body: string;
  previewUrl?: boolean;
}

interface TemplateInput extends GovernedSendInput {
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

interface MediaInput extends GovernedSendInput {
  mediaType: "image" | "document" | "audio" | "video";
  mediaId: string;
  caption?: string;
}

function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function withOutboundRecord<T extends GovernedSendInput>(
  userId: string,
  input: T,
  type: MessageType,
  send: () => Promise<{ providerMessageId: string | null; status: "sent" | "failed"; diagnostics?: string }>,
) {
  if (input.optedOut) {
    throw new Error("WhatsApp contact has opted out of outbound messaging.");
  }
  if (type !== "template" && !isWithinWhatsAppServiceWindow(input.lastInboundAt ?? null)) {
    throw new Error("WhatsApp free-form replies require a 24-hour service window; use an approved template instead.");
  }

  const admin = createAdminClient();
  const idempotencyKey = input.idempotencyKey;
  const hash = contentHash({ type, input });

  if (admin && idempotencyKey) {
    const existing = await admin
      .from("whatsapp_outbound_messages")
      .select("provider_message_id,status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.data && ["queued", "sent", "delivered", "read"].includes(String(existing.data.status))) {
      return {
        providerMessageId: (existing.data.provider_message_id as string | null) ?? null,
        status: "sent" as const,
        diagnostics: "duplicate_prevented",
      };
    }
  }

  try {
    const result = await send();
    if (admin && idempotencyKey) {
      await admin.from("whatsapp_outbound_messages").upsert(
        {
          user_id: userId,
          conversation_id: input.conversationId ?? null,
          company_id: input.companyId ?? null,
          provider_message_id: result.providerMessageId,
          idempotency_key: idempotencyKey,
          content_hash: hash,
          message_type: type,
          status: result.status,
          approval_id: input.approvalId ?? null,
          failure_reason: result.status === "failed" ? (result.diagnostics ?? "failed") : null,
        },
        { onConflict: "idempotency_key" },
      );
    }
    return result;
  } catch (error) {
    if (admin && idempotencyKey) {
      await admin.from("whatsapp_outbound_messages").upsert(
        {
          user_id: userId,
          conversation_id: input.conversationId ?? null,
          company_id: input.companyId ?? null,
          idempotency_key: idempotencyKey,
          content_hash: hash,
          message_type: type,
          status: "failed",
          approval_id: input.approvalId ?? null,
          failure_reason: error instanceof Error ? error.message.slice(0, 500) : "failed",
        },
        { onConflict: "idempotency_key" },
      );
    }
    throw error;
  }
}

export function registerWhatsAppCapabilities(): void {
  registerCapabilityHandler("whatsapp", "verify_business_account", async () => verifyWhatsAppBusinessAccount());
  registerCapabilityHandler("whatsapp", "verify_phone_number", async () => verifyWhatsAppPhoneNumber());
  registerCapabilityHandler("whatsapp", "list_templates", async () => listWhatsAppTemplates());
  registerCapabilityHandler("whatsapp", "send_text", async ({ userId, input }) =>
    withOutboundRecord(userId, input as TextInput, "text", () => sendWhatsAppText(input as TextInput)),
  );
  registerCapabilityHandler("whatsapp", "send_template", async ({ userId, input }) =>
    withOutboundRecord(userId, input as TemplateInput, "template", () => sendWhatsAppTemplate(input as TemplateInput)),
  );
  registerCapabilityHandler("whatsapp", "send_media", async ({ userId, input }) => {
    const media = input as MediaInput;
    return withOutboundRecord(userId, media, media.mediaType, () => sendWhatsAppMedia(media));
  },
  );
  registerCapabilityHandler("whatsapp", "receive_message", async () => ({ ok: true, mode: "webhook" }));
}

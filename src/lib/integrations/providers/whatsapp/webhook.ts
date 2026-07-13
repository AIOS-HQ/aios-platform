import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOpsEvent } from "@/lib/observability/ops";
import { isWhatsAppOptOutText } from "./client";

export interface WhatsAppInboundMessage {
  eventId: string;
  phoneNumberId: string;
  from: string;
  contactName: string | null;
  text: string;
  timestamp: string | null;
}

export interface WhatsAppStatusEvent {
  eventId: string;
  phoneNumberId: string;
  providerMessageId: string;
  status: string;
  timestamp: string | null;
}

export interface WhatsAppWebhookResult {
  processed: number;
  duplicates: number;
  unsupported: number;
  blockers: string[];
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoFromUnixSeconds(value: unknown): string | null {
  const raw = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(raw)) return null;
  return new Date(raw * 1000).toISOString();
}

export function hashWhatsAppContact(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractWhatsAppWebhookEvents(payload: unknown): {
  messages: WhatsAppInboundMessage[];
  statuses: WhatsAppStatusEvent[];
  unsupported: number;
} {
  const messages: WhatsAppInboundMessage[] = [];
  const statuses: WhatsAppStatusEvent[] = [];
  let unsupported = 0;
  const root = asRecord(payload);
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(asRecord(entry).changes) ? asRecord(entry).changes as unknown[] : [];
    for (const change of changes) {
      const value = asRecord(asRecord(change).value);
      const metadata = asRecord(value.metadata);
      const phoneNumberId = stringValue(metadata.phone_number_id);
      if (!phoneNumberId) {
        unsupported += 1;
        continue;
      }

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const firstContact = asRecord(contacts[0]);
      const contactName = stringValue(asRecord(firstContact.profile).name);

      for (const rawMessage of Array.isArray(value.messages) ? value.messages : []) {
        const message = asRecord(rawMessage);
        const eventId = stringValue(message.id);
        const from = stringValue(message.from);
        const type = stringValue(message.type);
        if (!eventId || !from || type !== "text") {
          unsupported += 1;
          continue;
        }
        const text = stringValue(asRecord(message.text).body);
        if (!text) {
          unsupported += 1;
          continue;
        }
        messages.push({
          eventId,
          phoneNumberId,
          from,
          contactName,
          text,
          timestamp: isoFromUnixSeconds(message.timestamp),
        });
      }

      for (const rawStatus of Array.isArray(value.statuses) ? value.statuses : []) {
        const status = asRecord(rawStatus);
        const eventId = stringValue(status.id);
        const providerMessageId = stringValue(status.id);
        const state = stringValue(status.status);
        if (!eventId || !providerMessageId || !state) {
          unsupported += 1;
          continue;
        }
        statuses.push({
          eventId: `${eventId}:${state}`,
          phoneNumberId,
          providerMessageId,
          status: state,
          timestamp: isoFromUnixSeconds(status.timestamp),
        });
      }
    }
  }
  return { messages, statuses, unsupported };
}

function safeMessagePreview(message: string): string {
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

export async function processWhatsAppWebhook(payload: unknown): Promise<WhatsAppWebhookResult> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      processed: 0,
      duplicates: 0,
      unsupported: 0,
      blockers: ["SUPABASE_SERVICE_ROLE_KEY is required to process WhatsApp webhooks."],
    };
  }

  const parsed = extractWhatsAppWebhookEvents(payload);
  let processed = 0;
  let duplicates = 0;
  const blockers: string[] = [];

  for (const message of parsed.messages) {
    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id,user_id,company_id")
      .eq("kind", "whatsapp")
      .eq("handle", message.phoneNumberId)
      .maybeSingle();
    if (channelError || !channel) {
      blockers.push(`No WhatsApp channel is connected for phone number id ${message.phoneNumberId}.`);
      continue;
    }

    const inserted = await admin
      .from("whatsapp_webhook_events")
      .insert({
        event_id: message.eventId,
        user_id: channel.user_id,
        channel_id: channel.id,
        company_id: channel.company_id,
        phone_number_id: message.phoneNumberId,
        event_type: "message.text",
        provider_message_id: message.eventId,
        contact_hash: hashWhatsAppContact(message.from),
        safe_payload: {
          contactName: message.contactName,
          timestamp: message.timestamp,
          preview: safeMessagePreview(message.text),
          optOut: isWhatsAppOptOutText(message.text),
        },
      });
    if (inserted.error) {
      if (/duplicate|unique/i.test(inserted.error.message)) duplicates += 1;
      else blockers.push(inserted.error.message);
      continue;
    }

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id")
      .eq("channel_id", channel.id)
      .eq("contact", message.from)
      .maybeSingle();
    if (conversationError) {
      blockers.push(conversationError.message);
      continue;
    }

    let conversationId = conversation?.id as string | undefined;
    if (!conversationId) {
      const created = await admin
        .from("conversations")
        .insert({
          user_id: channel.user_id,
          channel_id: channel.id,
          company_id: channel.company_id,
          contact: message.from,
          subject: message.contactName ?? "WhatsApp conversation",
          status: "open",
          last_message_at: message.timestamp ?? new Date().toISOString(),
        })
        .select("id")
        .single();
      if (created.error || !created.data) {
        blockers.push(created.error?.message ?? "Could not create WhatsApp conversation.");
        continue;
      }
      conversationId = created.data.id as string;
    }

    const saved = await admin.from("messages").insert({
      user_id: channel.user_id,
      conversation_id: conversationId,
      direction: "inbound",
      body: message.text,
      status: "received",
      created_at: message.timestamp ?? new Date().toISOString(),
    });
    if (saved.error) {
      blockers.push(saved.error.message);
      continue;
    }
    await admin
      .from("conversations")
      .update({ last_message_at: message.timestamp ?? new Date().toISOString(), status: "open" })
      .eq("id", conversationId);
    await recordOpsEvent({
      userId: channel.user_id,
      companyId: channel.company_id,
      level: isWhatsAppOptOutText(message.text) ? "warn" : "info",
      source: "whatsapp.webhook",
      message: isWhatsAppOptOutText(message.text)
        ? "WhatsApp opt-out request received."
        : "WhatsApp inbound message received.",
      context: {
        phoneNumberId: message.phoneNumberId,
        providerMessageId: message.eventId,
        contactHash: hashWhatsAppContact(message.from),
      },
    });
    processed += 1;
  }

  for (const status of parsed.statuses) {
    const inserted = await admin
      .from("whatsapp_webhook_events")
      .insert({
        event_id: status.eventId,
        phone_number_id: status.phoneNumberId,
        event_type: `status.${status.status}`,
        provider_message_id: status.providerMessageId,
        safe_payload: { status: status.status, timestamp: status.timestamp },
      });
    if (inserted.error) {
      if (/duplicate|unique/i.test(inserted.error.message)) duplicates += 1;
      else blockers.push(inserted.error.message);
      continue;
    }
    processed += 1;
  }

  return {
    processed,
    duplicates,
    unsupported: parsed.unsupported,
    blockers: Array.from(new Set(blockers)),
  };
}

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { redactSecret } from "@/lib/integrations/secret-redaction";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface WhatsAppConfigStatus {
  configured: boolean;
  missing: string[];
  phoneNumberId: string | null;
  businessAccountId: string | null;
}

export interface WhatsAppSendTextInput {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppSendTemplateInput {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

export interface WhatsAppSendMediaInput {
  to: string;
  mediaType: "image" | "document" | "audio" | "video";
  mediaId: string;
  caption?: string;
}

export interface WhatsAppMessageResult {
  providerMessageId: string | null;
  status: "sent" | "failed";
  diagnostics?: string;
}

function accessToken(): string | null {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? null;
}

export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const required = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null,
  };
}

export function verifyWhatsAppWebhookToken(mode: string | null, token: string | null): boolean {
  return mode === "subscribe" && Boolean(token) && token === process.env.WHATSAPP_VERIFY_TOKEN;
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const actual = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  if (!token) throw new Error("WhatsApp access token is not configured.");
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(redactSecret(`WhatsApp Cloud API failed ${res.status}: ${JSON.stringify(json).slice(0, 500)}`));
  }
  return json as T;
}

function messageId(json: unknown): string | null {
  return (json as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null;
}

export async function verifyWhatsAppBusinessAccount(): Promise<{ id: string | null; name: string | null }> {
  const config = getWhatsAppConfigStatus();
  if (!config.businessAccountId) throw new Error("WhatsApp Business Account ID is not configured.");
  const json = await graph<{ id?: string; name?: string }>(
    `/${encodeURIComponent(config.businessAccountId)}?fields=id,name`,
  );
  return { id: json.id ?? null, name: json.name ?? null };
}

export async function verifyWhatsAppPhoneNumber(): Promise<{ id: string | null; displayPhoneNumber: string | null; verifiedName: string | null }> {
  const config = getWhatsAppConfigStatus();
  if (!config.phoneNumberId) throw new Error("WhatsApp phone number ID is not configured.");
  const json = await graph<{ id?: string; display_phone_number?: string; verified_name?: string }>(
    `/${encodeURIComponent(config.phoneNumberId)}?fields=id,display_phone_number,verified_name`,
  );
  return {
    id: json.id ?? null,
    displayPhoneNumber: json.display_phone_number ?? null,
    verifiedName: json.verified_name ?? null,
  };
}

export async function listWhatsAppTemplates(): Promise<unknown> {
  const config = getWhatsAppConfigStatus();
  if (!config.businessAccountId) throw new Error("WhatsApp Business Account ID is not configured.");
  return graph(`/${encodeURIComponent(config.businessAccountId)}/message_templates?limit=50`);
}

export async function sendWhatsAppText(input: WhatsAppSendTextInput): Promise<WhatsAppMessageResult> {
  const config = getWhatsAppConfigStatus();
  if (!config.phoneNumberId) throw new Error("WhatsApp phone number ID is not configured.");
  const json = await graph(`/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "text",
      text: { body: input.body, preview_url: input.previewUrl ?? false },
    }),
  });
  return { providerMessageId: messageId(json), status: "sent" };
}

export async function sendWhatsAppTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppMessageResult> {
  const config = getWhatsAppConfigStatus();
  if (!config.phoneNumberId) throw new Error("WhatsApp phone number ID is not configured.");
  const json = await graph(`/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components ?? [],
      },
    }),
  });
  return { providerMessageId: messageId(json), status: "sent" };
}

export async function sendWhatsAppMedia(input: WhatsAppSendMediaInput): Promise<WhatsAppMessageResult> {
  const config = getWhatsAppConfigStatus();
  if (!config.phoneNumberId) throw new Error("WhatsApp phone number ID is not configured.");
  const json = await graph(`/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: input.mediaType,
      [input.mediaType]: {
        id: input.mediaId,
        ...(input.caption ? { caption: input.caption } : {}),
      },
    }),
  });
  return { providerMessageId: messageId(json), status: "sent" };
}

export function isWithinWhatsAppServiceWindow(lastInboundAt: string | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  const inbound = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(inbound)) return false;
  return now.getTime() - inbound <= 24 * 60 * 60 * 1000;
}

export function isWhatsAppOptOutText(text: string): boolean {
  return /^(stop|unsubscribe|opt\s*out|cancel)$/i.test(text.trim());
}

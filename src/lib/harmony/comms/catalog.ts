/**
 * Communications channel catalog — the 9 supported channels and what each needs
 * to go live. Pure + dependency-free. Adapters are mocked until credentials are
 * supplied (see `adapters.ts`).
 */

export type ChannelKind =
  | "whatsapp"
  | "email"
  | "sms"
  | "telegram"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "x"
  | "web_chat";

export type ChannelTemplate = {
  kind: ChannelKind;
  name: string;
  /** Whether going live requires external credentials / paid setup. */
  requiresCredentials: boolean;
  /** Short note on what connecting it will need. */
  setup: string;
};

export const CHANNEL_TEMPLATES: readonly ChannelTemplate[] = [
  { kind: "whatsapp", name: "WhatsApp Business", requiresCredentials: true, setup: "Meta Business verification + a BSP (Twilio / 360dialog / Meta Cloud API)" },
  { kind: "email", name: "Email", requiresCredentials: true, setup: "An email provider (Resend / Postmark / SES) + a verified domain" },
  { kind: "sms", name: "SMS", requiresCredentials: true, setup: "An SMS provider (Twilio) + a phone number" },
  { kind: "telegram", name: "Telegram", requiresCredentials: true, setup: "A free Telegram Bot API token" },
  { kind: "facebook", name: "Facebook", requiresCredentials: true, setup: "A Meta app + Page access (Graph API)" },
  { kind: "instagram", name: "Instagram", requiresCredentials: true, setup: "A Meta app + Instagram business account" },
  { kind: "linkedin", name: "LinkedIn", requiresCredentials: true, setup: "A LinkedIn OAuth app" },
  { kind: "x", name: "X", requiresCredentials: true, setup: "An X developer app (paid API tier)" },
  { kind: "web_chat", name: "Website Chat", requiresCredentials: false, setup: "Self-hosted widget — no external account needed" },
] as const;

export const CHANNEL_KINDS: readonly ChannelKind[] = CHANNEL_TEMPLATES.map(
  (c) => c.kind,
);

export function getChannelTemplate(kind: string): ChannelTemplate | undefined {
  return CHANNEL_TEMPLATES.find((c) => c.kind === kind);
}

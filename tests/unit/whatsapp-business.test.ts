import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isWhatsAppOptOutText,
  isWithinWhatsAppServiceWindow,
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookToken,
} from "@/lib/integrations/providers/whatsapp/client";
import {
  extractWhatsAppWebhookEvents,
  hashWhatsAppContact,
} from "@/lib/integrations/providers/whatsapp/webhook";
import { getConnectorDefinition } from "@/lib/integrations/registry";

describe("WhatsApp Business Cloud API foundation", () => {
  it("configuration-gates WhatsApp with official Cloud API environment names", () => {
    const def = getConnectorDefinition("whatsapp");
    expect(def?.auth).toBe("api_key");
    expect(def?.requiredEnv).toEqual([
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_APP_SECRET",
    ]);
    expect(def?.capabilities.map((cap) => cap.id)).toContain("send_text");
    expect(def?.capabilities.find((cap) => cap.id === "send_text")?.risk).toBe("approval");
  });

  it("validates webhook verification token and signed payloads", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const raw = JSON.stringify({ ok: true });
    const sig = `sha256=${createHmac("sha256", "app-secret").update(raw, "utf8").digest("hex")}`;

    expect(verifyWhatsAppWebhookToken("subscribe", "verify-token")).toBe(true);
    expect(verifyWhatsAppWebhookToken("subscribe", "wrong")).toBe(false);
    expect(verifyWhatsAppSignature(raw, sig)).toBe(true);
    expect(verifyWhatsAppSignature(raw, "sha256=bad")).toBe(false);
  });

  it("normalizes inbound text and status callbacks without raw credentials", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "12345" },
            contacts: [{ profile: { name: "Customer" } }],
            messages: [{
              id: "wamid.1",
              from: "15555550123",
              timestamp: "1783910000",
              type: "text",
              text: { body: "Hello" },
            }],
            statuses: [{ id: "wamid.2", status: "delivered", timestamp: "1783910001" }],
          },
        }],
      }],
    };
    const events = extractWhatsAppWebhookEvents(payload);
    expect(events.messages).toHaveLength(1);
    expect(events.messages[0].text).toBe("Hello");
    expect(events.statuses[0].status).toBe("delivered");
    expect(hashWhatsAppContact("15555550123")).toHaveLength(64);
  });

  it("enforces service-window and opt-out helpers", () => {
    expect(isWithinWhatsAppServiceWindow(new Date(Date.now() - 60_000).toISOString())).toBe(true);
    expect(isWithinWhatsAppServiceWindow(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())).toBe(false);
    expect(isWhatsAppOptOutText("STOP")).toBe(true);
    expect(isWhatsAppOptOutText("continue")).toBe(false);
  });
});

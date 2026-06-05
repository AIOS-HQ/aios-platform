import { describe, it, expect } from "vitest";
import {
  CHANNEL_KINDS,
  CHANNEL_TEMPLATES,
  getChannelTemplate,
} from "@/lib/harmony/comms/catalog";

describe("communications catalog", () => {
  it("supports all nine channels with unique kinds", () => {
    expect(CHANNEL_TEMPLATES).toHaveLength(9);
    expect(new Set(CHANNEL_KINDS).size).toBe(9);
    for (const kind of [
      "whatsapp",
      "email",
      "sms",
      "telegram",
      "facebook",
      "instagram",
      "linkedin",
      "x",
      "web_chat",
    ]) {
      expect(CHANNEL_KINDS).toContain(kind);
    }
  });

  it("marks website chat as the only credential-free channel", () => {
    const free = CHANNEL_TEMPLATES.filter((c) => !c.requiresCredentials);
    expect(free.map((c) => c.kind)).toEqual(["web_chat"]);
  });

  it("looks up a template by kind", () => {
    expect(getChannelTemplate("whatsapp")?.name).toBe("WhatsApp Business");
    expect(getChannelTemplate("nope")).toBeUndefined();
  });
});

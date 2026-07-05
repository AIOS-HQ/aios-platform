import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectAffordanceFor,
  connectGateEnabled,
  connectHref,
  isConnectable,
} from "@/lib/integrations/connect-gate";
import { getConnectorDefinition, listConnectorDefinitions } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";
import { familyRequiredEnv } from "@/lib/integrations/oauth-families";

/**
 * Regression guard for the Connector Operating System connect wiring.
 *
 * The bug this locks out: connectors that are developer-configured ("Ready")
 * silently rendering with NO live Connect action. The invariant is that a
 * Ready + authorizable OAuth connector always resolves to a "connect"
 * affordance (which every surface must render as an active control), and that
 * the connect URL is the one universal route for every provider.
 */

const NOT_CONNECTED = { connected: false, expired: false };

function configureFamilyEnv(connectorId: string): void {
  const def = getConnectorDefinition(connectorId);
  if (!def?.oauthFamily) return;
  for (const key of familyRequiredEnv(def.oauthFamily)) vi.stubEnv(key, "test-client-value");
}

describe("connect-gate — Ready connectors must stay connectable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exposes ONE universal connect route for every provider", () => {
    expect(connectHref("gmail")).toBe("/api/integrations/gmail/connect");
    expect(connectHref("google_drive")).toBe("/api/integrations/google_drive/connect");
  });

  it("defaults the connect gate ON unless explicitly disabled", () => {
    expect(connectGateEnabled()).toBe(true);
    vi.stubEnv("CONNECTOR_GATE_ENABLED", "false");
    expect(connectGateEnabled()).toBe(false);
  });

  it("Gmail is authorizable and offers a live Connect once configured", () => {
    const gmail = getConnectorDefinition("gmail");
    expect(gmail?.authorizable).toBe(true);
    configureFamilyEnv("gmail");
    const affordance = connectAffordanceFor("gmail", NOT_CONNECTED);
    expect(affordance).toBe("connect");
    expect(isConnectable(affordance)).toBe(true);
  });

  it("gates an authorizable OAuth provider that is not yet configured (finish_setup, never coming_soon)", () => {
    // No family env → not dev-configured; gate is ON by default.
    expect(connectAffordanceFor("google_drive", NOT_CONNECTED)).toBe("finish_setup");
  });

  it("EVERY authorizable OAuth connector that is dev-configured resolves to a live Connect", () => {
    const authorizableOauth = listConnectorDefinitions().filter(
      (c) => c.auth === "oauth2" && c.authorizable,
    );
    expect(authorizableOauth.length).toBeGreaterThan(0);
    for (const def of authorizableOauth) configureFamilyEnv(def.id);

    const ready = authorizableOauth.filter((d) => isDevConfigured(d));
    expect(ready.length).toBeGreaterThan(0);
    for (const def of ready) {
      expect(
        connectAffordanceFor(def.id, NOT_CONNECTED),
        `${def.id} is Ready + authorizable and must be connectable`,
      ).toBe("connect");
    }
  });

  it("reflects live connection state", () => {
    configureFamilyEnv("gmail");
    expect(connectAffordanceFor("gmail", { connected: true, expired: false })).toBe("connected");
    expect(connectAffordanceFor("gmail", { connected: true, expired: true })).toBe("reauthorize");
  });

  it("returns coming_soon for non-authorizable or unknown providers", () => {
    expect(connectAffordanceFor("openai", NOT_CONNECTED)).toBe("coming_soon");
    expect(connectAffordanceFor("does_not_exist", NOT_CONNECTED)).toBe("coming_soon");
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECTOR_BRAND } from "@/components/brand/brand-icons";
import { listConnectorDefinitions, type ConnectorDefinition } from "@/lib/integrations/registry";
import { assessIntegrationReadiness } from "@/lib/integrations/readiness";
import { SELF_TEST_PROBES } from "@/lib/integrations/self-test-probes";
import type { NormalizedConnectorHealth } from "@/lib/integrations/connector-health";

const ROOT = process.cwd();

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function healthFor(
  def: ConnectorDefinition,
  overrides: Partial<NormalizedConnectorHealth> = {},
): NormalizedConnectorHealth {
  return {
    provider: def.id,
    name: def.name,
    connectionMode: def.auth,
    configured: false,
    connected: false,
    healthy: false,
    identity: null,
    workspace: null,
    requiredScopes: def.scopes ?? [],
    grantedScopes: [],
    token: { present: false, valid: null, expiresAt: null, expired: false, refreshable: false },
    capabilities: Object.fromEntries(def.capabilities.map((cap) => [cap.id, false])),
    capabilityDetails: def.capabilities.map((cap) => ({
      id: cap.id,
      mode: cap.mode,
      risk: cap.risk ?? (cap.mode === "write" ? "approval" : "routine"),
      implemented: false,
    })),
    checkedAt: "2026-07-12T00:00:00.000Z",
    warnings: [],
    blockers: [],
    diagnostics: {},
    ...overrides,
  };
}

describe("Integration Center certification", () => {
  it("keeps connector registry IDs unique", () => {
    const ids = listConnectorDefinitions().map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses local brand glyphs for visible providers or an approved fallback", () => {
    const approvedFallbacks = new Set([
      "webhooks",
      "printer",
      "scanner",
      "fax",
      "multifunction_device",
      "network_storage",
    ]);
    const missing = listConnectorDefinitions()
      .map((def) => def.id)
      .filter((id) => !CONNECTOR_BRAND[id] && !approvedFallbacks.has(id));

    expect(missing).toEqual([]);
  });

  it("does not classify metadata-only providers as production-ready", () => {
    const vercel = listConnectorDefinitions().find((def) => def.id === "vercel");
    expect(vercel).toBeDefined();

    const readiness = assessIntegrationReadiness(vercel!, healthFor(vercel!));

    expect(readiness.classification).toBe("framework_only");
    expect(readiness.implementedCapabilities).toEqual([]);
  });

  it("keeps X video publishing unavailable while surfacing certified Social capabilities", () => {
    const x = listConnectorDefinitions().find((def) => def.id === "x");
    expect(x).toBeDefined();

    const readiness = assessIntegrationReadiness(
      x!,
      healthFor(x!, {
        configured: true,
        connected: true,
        healthy: false,
        identity: "@aios",
        token: { present: true, valid: true, expiresAt: "2999-01-01T00:00:00.000Z", expired: false, refreshable: true },
      }),
    );

    expect(readiness.implementedCapabilities).toEqual(
      expect.arrayContaining(["Text Post", "Image Post", "Multi Image Post"]),
    );
    expect(readiness.unavailableCapabilities).toEqual(
      expect.arrayContaining(["Read Timeline", "Video Post"]),
    );
    expect(readiness.classification).toBe("partial");
  });

  it("allows YouTube to become production-ready only when configured, connected, scoped, and fully implemented", () => {
    const youtube = listConnectorDefinitions().find((def) => def.id === "youtube");
    expect(youtube).toBeDefined();

    const readiness = assessIntegrationReadiness(
      youtube!,
      healthFor(youtube!, {
        configured: true,
        connected: true,
        healthy: true,
        identity: "AIOS channel",
        grantedScopes: youtube!.scopes ?? [],
        token: { present: true, valid: true, expiresAt: "2999-01-01T00:00:00.000Z", expired: false, refreshable: true },
        capabilities: Object.fromEntries(youtube!.capabilities.map((cap) => [cap.id, true])),
        capabilityDetails: youtube!.capabilities.map((cap) => ({
          id: cap.id,
          mode: cap.mode,
          risk: cap.risk ?? (cap.mode === "write" ? "approval" : "routine"),
          implemented: cap.mode === "read",
        })),
      }),
    );

    expect(readiness.classification).toBe("production_ready");
    expect(readiness.unavailableCapabilities).toEqual([]);
  });

  it("surfaces expired non-refreshable credentials as reauthorization required", () => {
    const github = listConnectorDefinitions().find((def) => def.id === "github");
    expect(github).toBeDefined();

    const readiness = assessIntegrationReadiness(
      github!,
      healthFor(github!, {
        configured: true,
        connected: true,
        healthy: false,
        token: { present: true, valid: false, expiresAt: "2020-01-01T00:00:00.000Z", expired: true, refreshable: false },
      }),
    );

    expect(readiness.classification).toBe("reauthorization_required");
  });

  it("exposes only safe read-only self-test probes", () => {
    expect(Object.keys(SELF_TEST_PROBES)).toEqual(
      expect.arrayContaining(["github", "linkedin", "x", "slack", "notion", "discord", "gmail", "google_calendar", "google_drive", "youtube"]),
    );
    for (const probe of Object.values(SELF_TEST_PROBES)) {
      expect(probe.url).toMatch(/^https:\/\//);
      expect(probe.url).not.toMatch(/token|secret|client_secret/i);
    }
  });

  it("wires official connector glyphs into Integration Center and settings connection cards", () => {
    const integrationCenter = source("src/app/(app)/harmony/integrations/integration-center.tsx");
    const settingsConnections = source("src/app/(app)/settings/connections/page.tsx");

    expect(integrationCenter).toContain("ConnectorGlyph");
    expect(integrationCenter).not.toContain("function Monogram");
    expect(settingsConnections).toContain("ConnectorGlyph");
  });

  it("prevents duplicate Harmony brand marks beside the authenticated Harmony lockup", () => {
    const guarded = [
      "src/components/auth/auth-shell.tsx",
      "src/app/onboarding/founder/page.tsx",
      "src/app/onboarding/harmony/page.tsx",
    ];

    for (const rel of guarded) {
      const text = source(rel);
      expect(text).toContain("AiosHarmonyLogo");
      expect(text).not.toContain("LogoMark");
      expect(text).not.toContain("HarmonyMark");
    }
  });

  it("preserves HarmonyAvatar for conversational identity surfaces", () => {
    const interactionSurfaces = [
      "src/components/harmony/operator/operator-console.tsx",
      "src/components/harmony/operator/ask-harmony-card.tsx",
      "src/components/harmony/harmony-awareness.tsx",
      "src/components/harmony/onboarding/guided-onboarding.tsx",
    ];

    for (const rel of interactionSurfaces) {
      expect(source(rel)).toContain("HarmonyAvatar");
    }
  });
});

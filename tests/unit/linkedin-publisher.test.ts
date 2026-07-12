import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLinkedInPublisherHealth,
  preflightLinkedInPublisher,
  redactLinkedInDiagnostics,
  redactLinkedInSecret,
} from "@/lib/integrations/linkedin-publisher";

const KEYS = [
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_PUBLISHER_ACCESS_TOKEN",
  "LINKEDIN_ORGANIZATION_URN",
  "LINKEDIN_ORGANIZATION_ID",
  "LINKEDIN_API_VERSION",
] as const;

const original: Record<string, string | undefined> = {};
for (const key of KEYS) original[key] = process.env[key];

function restoreEnv() {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv();
});

describe("LinkedIn publisher health", () => {
  it("reports missing publisher configuration separately from sign-in", async () => {
    process.env.LINKEDIN_CLIENT_ID = "signin-client";
    process.env.LINKEDIN_CLIENT_SECRET = "signin-secret";

    const health = await getLinkedInPublisherHealth();

    expect(health.healthy).toBe(false);
    expect(health.signInConfigured).toBe(true);
    expect(health.publisherConfigured).toBe(false);
    expect(health.token.present).toBe(false);
    expect(health.issues.map((i) => i.code)).toEqual([
      "missing_publisher_token",
      "missing_organization",
    ]);
  });

  it("reports an invalid publisher token without exposing the token", async () => {
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = "secret-publisher-token";
    process.env.LINKEDIN_ORGANIZATION_URN = "urn:li:organization:123";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { message: "bad token" })));

    const health = await getLinkedInPublisherHealth();

    expect(health.healthy).toBe(false);
    expect(health.token.present).toBe(true);
    expect(health.token.valid).toBe(false);
    expect(health.issues.map((i) => i.code)).toContain("invalid_token");
    expect(JSON.stringify(health)).not.toContain("secret-publisher-token");
  });

  it("blocks an organization mismatch returned by LinkedIn", async () => {
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = "publisher-token";
    process.env.LINKEDIN_ORGANIZATION_URN = "urn:li:organization:123";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { id: 999, localizedName: "Wrong Org" })));

    const health = await getLinkedInPublisherHealth();

    expect(health.healthy).toBe(false);
    expect(health.token.valid).toBe(true);
    expect(health.permissions.organizationRead).toBe(true);
    expect(health.issues.map((i) => i.code)).toContain("organization_mismatch");
  });

  it("blocks a connected channel handle that differs from the approved organization", async () => {
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = "publisher-token";
    process.env.LINKEDIN_ORGANIZATION_ID = "123";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { id: 123, localizedName: "AIOS" })));

    const preflight = await preflightLinkedInPublisher("urn:li:organization:456");

    expect(preflight.ok).toBe(false);
    expect(preflight.author).toBe("urn:li:organization:123");
    expect(preflight.health.issues.map((i) => i.code)).toContain("organization_mismatch");
  });

  it("reports a valid publisher and implemented publishing capabilities", async () => {
    process.env.LINKEDIN_CLIENT_ID = "signin-client";
    process.env.LINKEDIN_CLIENT_SECRET = "signin-secret";
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = "publisher-token";
    process.env.LINKEDIN_ORGANIZATION_URN = "urn:li:organization:123";
    process.env.LINKEDIN_API_VERSION = "202604";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { id: 123, localizedName: "AIOS" })));

    const health = await getLinkedInPublisherHealth();

    expect(health.healthy).toBe(true);
    expect(health.signInConfigured).toBe(true);
    expect(health.publisherConfigured).toBe(true);
    expect(health.organization).toEqual({
      id: "123",
      urn: "urn:li:organization:123",
      name: "AIOS",
    });
    expect(health.permissions).toEqual({
      organizationPublish: true,
      organizationRead: true,
    });
    expect(health.capabilities).toEqual({
      textPost: true,
      documentCarousel: true,
    });
  });

  it("redacts secrets explicitly", () => {
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = "secret-publisher-token";

    expect(redactLinkedInSecret("secret-publisher-token")).toBe("[redacted]");
    expect(redactLinkedInDiagnostics("Bearer secret-publisher-token")).toBe("Bearer [redacted]");
    expect(redactLinkedInDiagnostics("token=secret-publisher-token")).toBe("token=[redacted]");
    expect(redactLinkedInSecret("")).toBe("");
    expect(redactLinkedInSecret(undefined)).toBe("");
  });
});

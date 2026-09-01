import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "founder-user" } as { id: string } | null,
  isAdmin: true,
  connectors: {
    supabase: { id: "supabase", auth: "api_key" },
    vercel: { id: "vercel", auth: "api_key" },
  } as Record<string, { id: string; auth: string }>,
  connections: [] as Array<{
    provider: string;
    status: string;
    scopes: string | null;
    external_account: string | null;
    created_at: string;
    connected_at: string | null;
    expires_at: string | null;
  }>,
  upsertResult: true,
  upserts: [] as Array<Record<string, unknown>>,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `translated:${key}`,
}));

vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: async () => state.user,
}));

vi.mock("@/lib/auth/roles", () => ({
  currentUserIsAdmin: async () => state.isAdmin,
}));

vi.mock("@/lib/integrations/connectors", () => ({
  getConnector: (provider: string) => state.connectors[provider] ?? null,
}));

vi.mock("@/lib/integrations/connections", () => ({
  getConnections: async () => state.connections,
  upsertConnection: async (row: Record<string, unknown>) => {
    state.upserts.push(row);
    return state.upsertResult;
  },
}));

describe("connectApiKeyAction", () => {
  beforeEach(() => {
    state.user = { id: "founder-user" };
    state.isAdmin = true;
    state.connections = [];
    state.upsertResult = true;
    state.upserts = [];
    state.revalidated = [];
  });

  it("updates an existing Supabase connection without requiring disconnect and preserves existing project ref when account is blank", async () => {
    state.connections = [
      {
        provider: "supabase",
        status: "connected",
        scopes: null,
        external_account: "project-ref",
        created_at: "2026-01-01T00:00:00.000Z",
        connected_at: "2026-01-01T00:00:00.000Z",
        expires_at: null,
      },
    ];

    const { connectApiKeyAction } = await import("@/lib/integrations/connect-actions");

    const form = new FormData();
    form.set("provider", "supabase");
    form.set("token", "new-production-token");
    form.set("account", "");

    const result = await connectApiKeyAction({ status: "idle" } as never, form);

    expect(result.status).toBe("success");
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      user_id: "founder-user",
      provider: "supabase",
      status: "connected",
      external_account: "project-ref",
      access_token: "new-production-token",
    });
    expect(JSON.stringify(result)).not.toContain("new-production-token");
    expect(state.revalidated).toEqual(["/settings/diagnostics", "/settings/connections"]);
  });

  it("fails closed on ambiguous duplicate provider rows and does not write", async () => {
    state.connections = [
      {
        provider: "supabase",
        status: "connected",
        scopes: null,
        external_account: "project-a",
        created_at: "2026-01-01T00:00:00.000Z",
        connected_at: "2026-01-01T00:00:00.000Z",
        expires_at: null,
      },
      {
        provider: "supabase",
        status: "connected",
        scopes: null,
        external_account: "project-b",
        created_at: "2026-01-02T00:00:00.000Z",
        connected_at: "2026-01-02T00:00:00.000Z",
        expires_at: null,
      },
    ];

    const { connectApiKeyAction } = await import("@/lib/integrations/connect-actions");

    const form = new FormData();
    form.set("provider", "supabase");
    form.set("token", "new-token");

    const result = await connectApiKeyAction({ status: "idle" } as never, form);

    expect(result).toEqual({ status: "error", message: "translated:errors.saveFailed" });
    expect(state.upserts).toHaveLength(0);
  });

  it("blocks unauthorized callers from updating API-key connections", async () => {
    state.isAdmin = false;

    const { connectApiKeyAction } = await import("@/lib/integrations/connect-actions");

    const form = new FormData();
    form.set("provider", "supabase");
    form.set("token", "new-token");

    const result = await connectApiKeyAction({ status: "idle" } as never, form);

    expect(result).toEqual({ status: "error", message: "translated:errors.unauthorized" });
    expect(state.upserts).toHaveLength(0);
  });

  it("keeps non-Supabase API-key integrations working unchanged", async () => {
    state.connections = [
      {
        provider: "vercel",
        status: "connected",
        scopes: null,
        external_account: "old-project",
        created_at: "2026-01-01T00:00:00.000Z",
        connected_at: "2026-01-01T00:00:00.000Z",
        expires_at: null,
      },
    ];

    const { connectApiKeyAction } = await import("@/lib/integrations/connect-actions");

    const form = new FormData();
    form.set("provider", "vercel");
    form.set("token", "new-vercel-token");
    form.set("account", "new-project");

    const result = await connectApiKeyAction({ status: "idle" } as never, form);

    expect(result.status).toBe("success");
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      provider: "vercel",
      external_account: "new-project",
    });
  });
});

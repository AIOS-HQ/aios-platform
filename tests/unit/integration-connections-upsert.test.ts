import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  upsertPayload: null as Record<string, unknown> | null,
  upsertOptions: null as Record<string, unknown> | null,
  upsertCalls: 0,
}));

vi.mock("@/lib/crypto/tokens", () => ({
  encryptToken: (value: string | null) => (value ? `enc:v1:${value}` : value),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (payload: Record<string, unknown>, options: Record<string, unknown>) => {
        if (table !== "integration_connections") {
          return { error: new Error("unexpected table") };
        }
        state.upsertCalls += 1;
        state.upsertPayload = payload;
        state.upsertOptions = options;
        return { error: null };
      },
    }),
  }),
}));

describe("upsertConnection conflict contract", () => {
  beforeEach(() => {
    state.upsertPayload = null;
    state.upsertOptions = null;
    state.upsertCalls = 0;
  });

  it("uses user_id+provider conflict target to reuse existing rows instead of duplicating", async () => {
    const { upsertConnection } = await import("@/lib/integrations/connections");

    const ok = await upsertConnection({
      user_id: "founder-user",
      provider: "supabase",
      status: "connected",
      scopes: null,
      external_account: "vgsqgxpwjnwssconsptn",
      access_token: "token-value",
      refresh_token: null,
      expires_at: null,
    });

    expect(ok).toBe(true);
    expect(state.upsertCalls).toBe(1);
    expect(state.upsertOptions).toEqual({ onConflict: "user_id,provider" });
    expect(state.upsertPayload).toMatchObject({
      user_id: "founder-user",
      provider: "supabase",
      provider_id: "supabase",
      external_account: "vgsqgxpwjnwssconsptn",
      access_token: "enc:v1:token-value",
      status: "connected",
    });
  });
});

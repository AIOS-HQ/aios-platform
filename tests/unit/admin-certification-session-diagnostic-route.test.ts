import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const currentUserIsAdmin = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/auth/user", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/roles", () => ({ currentUserIsAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser,
    },
  })),
}));

describe("admin certification session diagnostic route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.AIOS_VALIDATION_VERCEL_PREVIEW_HOST = "aios-platform-git-test-air-bid.vercel.app";
    getCurrentUser.mockResolvedValue({ id: "founder-1" });
    currentUserIsAdmin.mockResolvedValue(true);
    getUser.mockResolvedValue({ data: { user: { id: "founder-1" } }, error: null });
  });

  it("returns safe authenticated founder diagnostic in preview", async () => {
    const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
    const request = new Request("https://aios-platform-git-test-air-bid.vercel.app/api/admin/certification/session-diagnostic", {
      headers: {
        cookie: "sb-access-token=opaque; sb-refresh-token=opaque-refresh",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      environment: "preview",
      diagnostic: {
        supabaseConfigured: true,
        supabaseCookiePresent: true,
        authenticatedUserResolved: true,
        founderAuthorizationResolved: true,
        requestOriginMatchesConfiguredSiteOrigin: true,
        likelyFailureStage: "authenticated",
      },
    });
  });

  it("fails closed for unauthenticated user", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
    const response = await GET(new Request("https://aios-platform-git-test-air-bid.vercel.app/api/admin/certification/session-diagnostic"));
    expect(response.status).toBe(401);
  });

  it("fails closed for authenticated non-founder", async () => {
    currentUserIsAdmin.mockResolvedValueOnce(false);
    const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
    const response = await GET(new Request("https://aios-platform-git-test-air-bid.vercel.app/api/admin/certification/session-diagnostic"));
    expect(response.status).toBe(403);
  });

  it("fails closed for wrong preview origin", async () => {
    const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
    const response = await GET(new Request("https://unexpected.example/api/admin/certification/session-diagnostic"));
    expect(response.status).toBe(403);
  });

  it("does not expose sensitive fields in response", async () => {
    const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
    const response = await GET(new Request("https://aios-platform-git-test-air-bid.vercel.app/api/admin/certification/session-diagnostic"));
    const body = await response.json();
    const serialized = JSON.stringify(body).toLowerCase();

    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("userid");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("cookie=");
    expect(serialized).not.toContain("authorization:");
    expect(serialized).not.toContain("supabase_url");
    expect(serialized).not.toContain("service_role");
  });
});

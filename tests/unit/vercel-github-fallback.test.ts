import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidAccessToken: vi.fn(async () => "github-test-token"),
}));

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub Vercel deployment fallback", () => {
  it("reads the matching Vercel status and deployment without exposing auth", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/commits/sha-1/status")) {
        return response({
          statuses: [{
            context: "Vercel",
            state: "success",
            target_url: "https://vercel.com/team/project/deployment",
            created_at: "2026-07-21T05:00:00.000Z",
            updated_at: "2026-07-21T05:01:00.000Z",
          }],
        });
      }
      if (url.includes("/deployments?sha=sha-1")) {
        return response([{ id: 42, sha: "sha-1", environment: "Preview", created_at: "2026-07-21T05:00:00.000Z" }]);
      }
      if (url.includes("/deployments/42/statuses")) {
        return response([{ state: "success", environment_url: "https://preview.vercel.app", updated_at: "2026-07-21T05:01:00.000Z" }]);
      }
      throw new Error(`unexpected:${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { readGitHubVercelDeploymentEvidence } = await import("@/lib/integrations/clients/github");
    const result = await readGitHubVercelDeploymentEvidence("founder-1", {
      repository: "AIOS-HQ/aios-platform",
      gitSha: "sha-1",
      environment: "preview",
    });

    expect(result).toMatchObject({
      status: "success",
      deploymentId: 42,
      deploymentUrl: "https://preview.vercel.app",
      gitSha: "sha-1",
    });
    expect(result?.sources).toEqual(expect.arrayContaining([
      "github_vercel_status",
      "github_vercel_deployment",
      "github_vercel_deployment_status",
    ]));
    expect(JSON.stringify(result)).not.toContain("github-test-token");
  });

  it("preserves workflow head SHA for existing CI compatibility", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({
      workflow_runs: [{ name: "Launch Validation", status: "completed", conclusion: "success", head_sha: "sha-1" }],
    })));
    const { runGithubRead } = await import("@/lib/integrations/clients/github");
    const result = await runGithubRead("founder-1", "review_build_result", {
      repo: "AIOS-HQ/aios-platform",
    });
    expect(result.data?.runs).toEqual([
      { name: "Launch Validation", status: "completed", conclusion: "success", head_sha: "sha-1" },
    ]);
  });

  it("does not treat a generic Vercel status as production deployment proof", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/commits/sha-1/status")) {
        return response({ statuses: [{ context: "Vercel", state: "success" }] });
      }
      if (url.includes("/deployments?sha=sha-1")) return response([]);
      throw new Error(`unexpected:${url}`);
    }));
    const { readGitHubVercelDeploymentEvidence } = await import("@/lib/integrations/clients/github");
    await expect(readGitHubVercelDeploymentEvidence("founder-1", {
      repository: "AIOS-HQ/aios-platform",
      gitSha: "sha-1",
      environment: "production",
    })).resolves.toBeNull();
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { renderSocialPublishingWorkerTemplate } from "../../scripts/azure/render-social-publishing-worker.mjs";

const web = {
  name: "aios-runtime",
  image: "registry/aios-runtime:old",
  env: [
    { name: "SUPABASE_SERVICE_ROLE_KEY", secretRef: "supabase-service-role" },
    { name: "TOKEN_ENCRYPTION_KEY", secretRef: "token-encryption" },
    { name: "UNRELATED_SECRET", secretRef: "unrelated" },
  ],
  resources: { cpu: 0.5, memory: "1Gi" },
};

describe("social publishing worker deployment", () => {
  it("adds a disabled Node worker and carries only secure required secret references", () => {
    const rendered = renderSocialPublishingWorkerTemplate({ containers: [web], scale: { minReplicas: 1 } }, {
      webImage: "registry/aios-runtime:new",
      workerImage: "registry/aios-runtime:new-social-worker",
      webContainerName: "aios-runtime",
    });
    const worker = rendered.containers.find((container) => container.name === "social-publishing-worker");

    expect(rendered.containers[0].image).toBe("registry/aios-runtime:new");
    expect(worker).toMatchObject({
      image: "registry/aios-runtime:new-social-worker",
      resources: { cpu: 0.25, memory: "0.5Gi" },
      env: expect.arrayContaining([
        { name: "SUPABASE_SERVICE_ROLE_KEY", secretRef: "supabase-service-role" },
        { name: "TOKEN_ENCRYPTION_KEY", secretRef: "token-encryption" },
        { name: "AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED", value: "false" },
      ]),
    });
    expect(worker?.env).not.toContainEqual(expect.objectContaining({ name: "UNRELATED_SECRET" }));
    expect(worker?.probes.map((probe) => probe.type)).toEqual(["Liveness", "Readiness"]);
  });

  it("preserves an explicitly enabled worker across later Azure image revisions", () => {
    const rendered = renderSocialPublishingWorkerTemplate({
      containers: [web, {
        name: "social-publishing-worker",
        image: "registry/worker:old",
        env: [{ name: "AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED", value: "true" }],
      }],
    }, {
      webImage: "registry/web:new",
      workerImage: "registry/worker:new",
      webContainerName: "aios-runtime",
    });
    const worker = rendered.containers.find((container) => container.name === "social-publishing-worker");
    expect(worker?.env).toContainEqual({ name: "AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED", value: "true" });
  });

  it("keeps Preview disabled and logs only stable worker events", async () => {
    const [entrypoint, workerRuntime, workflow, dockerfile] = await Promise.all([
      readFile("scripts/social-publishing-worker.ts", "utf8"),
      readFile("src/lib/social-publishing/worker.ts", "utf8"),
      readFile(".github/workflows/aios-runtime-AutoDeployTrigger-e27f8fb8-1f56-4d74-ab1a-8ab2f82f4791.yml", "utf8"),
      readFile("Dockerfile", "utf8"),
    ]);
    expect(entrypoint).toContain('process.env.VERCEL_ENV === "preview"');
    expect(entrypoint).toContain('"TOKEN_ENCRYPTION_KEY"');
    expect(entrypoint).not.toContain("error.message");
    expect(workerRuntime).toContain("LOCK_HEARTBEAT_MS");
    expect(workerRuntime).toContain('eq("worker_id", input.workerId)');
    expect(workflow).toContain("AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED=false");
    expect(workflow).toContain("--target worker");
    expect(dockerfile).toContain("FROM base AS worker");
    expect(dockerfile).toContain("node:22-bookworm-slim");
    expect(dockerfile).toContain('"--conditions=react-server"');
  });
});

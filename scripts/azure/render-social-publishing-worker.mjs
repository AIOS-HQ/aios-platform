import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const WORKER_NAME = "social-publishing-worker";
const WORKER_ENV_ALLOWLIST = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
]);
const SECRET_ENV = new Set(["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]);

export function renderSocialPublishingWorkerTemplate(template, input) {
  if (!template || !Array.isArray(template.containers) || template.containers.length === 0) {
    throw new Error("container_app_template_invalid");
  }
  if (!input.webImage || !input.workerImage) throw new Error("container_images_required");

  const existingWorker = template.containers.find((container) => container.name === WORKER_NAME);
  const web = template.containers.find((container) => container.name === input.webContainerName)
    ?? template.containers.find((container) => container.name !== WORKER_NAME);
  if (!web) throw new Error("web_container_not_found");

  const inheritedEnv = (web.env ?? [])
    .filter((entry) => WORKER_ENV_ALLOWLIST.has(entry.name))
    .filter((entry) => !SECRET_ENV.has(entry.name) || Boolean(entry.secretRef))
    .map((entry) => entry.secretRef ? { name: entry.name, secretRef: entry.secretRef } : { name: entry.name, value: entry.value });
  const previousEnabled = (existingWorker?.env ?? [])
    .find((entry) => entry.name === "AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED")?.value;
  const worker = {
    name: WORKER_NAME,
    image: input.workerImage,
    env: [
      ...inheritedEnv,
      { name: "AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED", value: previousEnabled === "true" ? "true" : "false" },
      { name: "AIOS_SOCIAL_PUBLISHING_WORKER_HEALTH_PORT", value: "8081" },
    ],
    resources: { cpu: 0.25, memory: "0.5Gi" },
    probes: [
      {
        type: "Liveness",
        httpGet: { path: "/healthz", port: 8081, scheme: "HTTP" },
        initialDelaySeconds: 10,
        periodSeconds: 20,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
      {
        type: "Readiness",
        httpGet: { path: "/readyz", port: 8081, scheme: "HTTP" },
        initialDelaySeconds: 5,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
    ],
  };

  return {
    ...template,
    containers: [
      ...template.containers
        .filter((container) => container.name !== WORKER_NAME)
        .map((container) => container.name === web.name ? { ...container, image: input.webImage } : container),
      worker,
    ],
  };
}

async function main() {
  const [inputPath, outputPath, webImage, workerImage, webContainerName = "aios-runtime"] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("usage_error");
  const current = JSON.parse(await readFile(inputPath, "utf8"));
  const template = current?.properties?.template ?? current;
  const rendered = renderSocialPublishingWorkerTemplate(template, { webImage, workerImage, webContainerName });
  await writeFile(outputPath, `${JSON.stringify({ properties: { template: rendered } }, null, 2)}\n`, { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "render_failed");
    process.exitCode = 1;
  });
}

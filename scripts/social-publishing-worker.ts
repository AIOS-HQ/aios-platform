import { createServer } from "node:http";
import { assertSocialPublishingWorkerSchema, runSocialPublishingWorker } from "../src/lib/social-publishing/worker";

const controller = new AbortController();
const healthPort = Number(process.env.AIOS_SOCIAL_PUBLISHING_WORKER_HEALTH_PORT ?? "8081");
const explicitlyEnabled = process.env.AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED === "true";
const previewRuntime = process.env.VERCEL_ENV === "preview";
const enabled = explicitlyEnabled && !previewRuntime;
let ready = !enabled;
let stopping = false;

function assertWorkerConfiguration(): void {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  ];
  if (required.some((name) => !process.env[name])) throw new Error("worker_configuration_not_ready");
}

function safeLog(event: string): void {
  console.info(`[social-publishing-worker] ${event}`);
}

const server = createServer((request, response) => {
  if (request.url !== "/healthz" && request.url !== "/readyz") {
    response.writeHead(404).end();
    return;
  }
  const isReadyProbe = request.url === "/readyz";
  const ok = !stopping && (!isReadyProbe || ready);
  response.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ status: ok ? "ok" : "unavailable", mode: enabled ? "active" : "disabled" }));
});

function closeHealthServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  ready = false;
  safeLog(`shutdown_requested:${signal}`);
  controller.abort();
}

process.once("SIGTERM", () => void shutdown("sigterm"));
process.once("SIGINT", () => void shutdown("sigint"));

async function main(): Promise<void> {
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) {
    throw new Error("worker_health_port_invalid");
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(healthPort, "0.0.0.0", resolve);
  });
  if (!enabled) {
    safeLog(previewRuntime ? "disabled_preview" : "disabled");
    await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
    return;
  }
  assertWorkerConfiguration();
  await assertSocialPublishingWorkerSchema();
  ready = true;
  safeLog("ready");
  await runSocialPublishingWorker({ signal: controller.signal });
}

main()
  .catch(() => {
    ready = false;
    process.exitCode = 1;
    safeLog("fatal_safe_error");
  })
  .finally(async () => {
    stopping = true;
    ready = false;
    await closeHealthServer();
    safeLog("stopped");
  });

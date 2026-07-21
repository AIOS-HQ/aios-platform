import { runSocialPublishingWorker } from "../src/lib/social-publishing/worker";

const controller = new AbortController();
process.once("SIGTERM", () => controller.abort());
process.once("SIGINT", () => controller.abort());

runSocialPublishingWorker({ signal: controller.signal }).catch((error) => {
  console.error("[social-publishing-worker] stopped", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

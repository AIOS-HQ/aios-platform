import { runEventMeshWorker } from "../src/lib/event-mesh/worker";

runEventMeshWorker().catch((error) => {
  console.error("[event-mesh] worker failed to start", error);
  process.exit(1);
});

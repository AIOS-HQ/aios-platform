import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { M5_BOOTSTRAP_PROMOTION_REQUEST_ID } from "../../src/lib/promotion/request-id";

const scriptPath = "scripts/ci/derive-governed-promotion-request-id.ts";

function runDerive(commandArgs: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", scriptPath, ...commandArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

describe("derive-governed-promotion-request-id CLI", () => {
  it("emits derived request id for the canonical bootstrap tuple", () => {
    const result = runDerive(["m5-bootstrap-default", M5_BOOTSTRAP_PROMOTION_REQUEST_ID]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`derived_promotion_request_id=${M5_BOOTSTRAP_PROMOTION_REQUEST_ID}`);
    expect(result.stdout).toContain("migration_evidence_id=migration:7129b9249d0d44f98a09ae043db8885a4aa7205c5fa44b1392bf532bd1cc4ff6");
    expect(result.stdout).toContain("migration_artifact_id=github-artifact:9263764663");
  });

  it("fails closed on stale hard-coded promotion request id", () => {
    const result = runDerive([
      "m5-bootstrap-default",
      "promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("promotion_request_id_mismatch");
  });
});

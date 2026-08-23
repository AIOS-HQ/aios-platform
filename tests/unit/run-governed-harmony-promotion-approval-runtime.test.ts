import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("run-governed-harmony-promotion-approval runtime import", () => {
  it("loads in node/tsx without missing server-only module", () => {
    const script = [
      "import('./scripts/ci/run-governed-harmony-promotion-approval.ts')",
      "  .then(() => process.exit(0))",
      "  .catch((error) => { console.error(String(error?.message ?? error)); process.exit(1); });",
    ].join("\n");

    const result = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"].filter(Boolean).join(" "),
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("Cannot find module 'server-only'");
  });
});

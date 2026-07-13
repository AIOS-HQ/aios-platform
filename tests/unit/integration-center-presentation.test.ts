import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Integration Center production presentation", () => {
  it("does not use Coming Soon as an integration availability state", () => {
    const center = fs.readFileSync(
      path.join(ROOT, "src/app/(app)/harmony/integrations/integration-center.tsx"),
      "utf8",
    );
    const settings = fs.readFileSync(
      path.join(ROOT, "src/app/(app)/settings/integrations/page.tsx"),
      "utf8",
    );
    expect(center).not.toContain("Coming soon");
    expect(settings).not.toContain("comingSoon");
  });
});

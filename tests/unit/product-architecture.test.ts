import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AIOS_WORKFORCE, JULIUS, isReservedAirbidName } from "@/lib/workforce/registry";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("canonical AIOS product architecture", () => {
  it("defines the four product surfaces and universal runtime principle", () => {
    const doc = read("docs/product/AIOS_PRODUCT_ARCHITECTURE.md");
    expect(doc).toContain("One Universal AIOS Runtime");
    expect(doc).toContain("Public AIOS Website");
    expect(doc).toContain("Subscriber Harmony");
    expect(doc).toContain("Founder OS");
    expect(doc).toContain("Customer-Deployed Company Websites and Applications");
    expect(doc).toContain("AI-Operated Departments");
  });

  it("keeps older architecture docs pointed at the canonical product source", () => {
    for (const rel of [
      "README.md",
      "docs/ARCHITECTURE.md",
      "docs/PUBLIC_WEBSITE.md",
      "docs/SUBSCRIBER_HARMONY.md",
      "docs/architecture/aios-v1-architecture-blueprint.md",
      "docs/marketplace/README.md",
      "docs/ROADMAP.md",
    ]) {
      expect(read(rel), rel).toContain("AIOS_PRODUCT_ARCHITECTURE.md");
    }
  });

  it("keeps the canonical workforce source truthful", () => {
    expect(AIOS_WORKFORCE.map((agent) => agent.name)).toEqual([
      "Harmony",
      "Auditor",
      "Mason",
      "Catalyst",
      "Ambassador",
      "Atlas",
      "Pulse",
      "Horizon",
      "Aegis",
      "Ledger",
    ]);
    expect(JULIUS.isAgent).toBe(false);
    expect(AIOS_WORKFORCE.some((agent) => agent.name === "Julius")).toBe(false);
    expect(AIOS_WORKFORCE.some((agent) => isReservedAirbidName(agent.name))).toBe(false);
  });
});

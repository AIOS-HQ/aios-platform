import { describe, it, expect } from "vitest";
import { CODE_INTEGRATIONS } from "@/lib/harmony/os/code";

describe("CODE_INTEGRATIONS", () => {
  it("lists the planned Code Department integrations", () => {
    const keys = CODE_INTEGRATIONS.map((i) => i.key);
    expect(keys).toEqual(["github", "hyperagent", "vercel", "supabase", "ci"]);
  });

  it("has unique keys and non-empty names", () => {
    expect(new Set(CODE_INTEGRATIONS.map((i) => i.key)).size).toBe(
      CODE_INTEGRATIONS.length,
    );
    for (const i of CODE_INTEGRATIONS) expect(i.name.length).toBeGreaterThan(0);
  });
});

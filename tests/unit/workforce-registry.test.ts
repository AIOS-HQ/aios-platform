import { describe, expect, it } from "vitest";
import {
  WORKFORCE_SPECIALISTS,
  getAgentConnectors,
  getAiosAgent,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";

describe("AIOS workforce registry", () => {
  it("registers Mason as the Founder-only engineering specialist", () => {
    const mason = getAiosAgent("mason");

    expect(mason?.name).toBe("Mason");
    expect(mason?.role).toBe("Founder Native Chief Software Engineer");
    expect(mason?.responsibilities.join(" ").toLowerCase()).toContain("pull request");
    expect(isFounderOnlyAgent("mason")).toBe(true);
    expect(isFounderOnlyAgent("harmony")).toBe(false);
    expect(getAgentConnectors("mason")).toEqual(["github", "vercel"]);
  });

  it("keeps Mason in Harmony's specialist workforce", () => {
    expect(WORKFORCE_SPECIALISTS.map((agent) => agent.key)).toContain("mason");
  });
});

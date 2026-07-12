import { describe, expect, it } from "vitest";
import {
  AIOS_WORKFORCE,
  JULIUS,
  WORKFORCE_SPECIALISTS,
  isReservedAirbidName,
  getAgentConnectors,
  getAiosAgent,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";

describe("AIOS workforce registry", () => {
  it("keeps the canonical AIOS workforce distinct from Julius and AirBid", () => {
    expect(AIOS_WORKFORCE.map((agent) => agent.key)).toEqual([
      "harmony",
      "auditor",
      "mason",
      "catalyst",
      "ambassador",
      "atlas",
      "pulse",
      "horizon",
      "aegis",
      "ledger",
    ]);
    expect(JULIUS.isAgent).toBe(false);
    expect(getAiosAgent("julius")).toBeUndefined();
    for (const name of ["Nexus", "Sentinel", "Guardian", "Oracle", "Compass"]) {
      expect(isReservedAirbidName(name)).toBe(true);
      expect(getAiosAgent(name.toLowerCase())).toBeUndefined();
    }
  });

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

  it("surfaces Catalyst's certified Social provider dependencies", () => {
    expect(getAgentConnectors("catalyst")).toEqual(["linkedin", "x", "youtube"]);
  });
});

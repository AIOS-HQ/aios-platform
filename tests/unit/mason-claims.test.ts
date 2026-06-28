import { describe, expect, it } from "vitest";
import { MASON_CLAIM_RULES } from "@/lib/workforce/mason-claims";

describe("Mason claim rules", () => {
  it("requires system-backed claims", () => {
    expect(MASON_CLAIM_RULES).toContain("AIOS provides");
  });
});

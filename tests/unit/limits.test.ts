import { describe, it, expect } from "vitest";
import { LIMITS, exceedsLimits } from "@/lib/limits";

describe("LIMITS", () => {
  it("exposes the expected input caps (M-2 hardening)", () => {
    expect(LIMITS.title).toBe(200);
    expect(LIMITS.description).toBe(2000);
    expect(LIMITS.noteContent).toBe(20000);
    expect(LIMITS.brainContent).toBe(20000);
    expect(LIMITS.name).toBe(120);
    expect(LIMITS.tag).toBe(40);
    expect(LIMITS.tagsCount).toBe(12);
    expect(LIMITS.operatorInput).toBe(2000);
  });
});

describe("exceedsLimits", () => {
  it("returns false when every value is within its max", () => {
    expect(exceedsLimits([["hello", 10], ["world", 10]])).toBe(false);
  });

  it("returns true when any value exceeds its max", () => {
    expect(exceedsLimits([["ok", 10], ["x".repeat(11), 10]])).toBe(true);
  });

  it("treats null/undefined/empty as length 0", () => {
    expect(exceedsLimits([[null, 0], [undefined, 5], ["", 0]])).toBe(false);
  });

  it("allows a value exactly equal to its max (boundary)", () => {
    expect(exceedsLimits([["x".repeat(10), 10]])).toBe(false);
  });

  it("returns false for an empty pair list", () => {
    expect(exceedsLimits([])).toBe(false);
  });
});

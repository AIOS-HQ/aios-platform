import { describe, it, expect } from "vitest";
import { parseTags, uniqueTags } from "@/lib/harmony/tags";
import { LIMITS } from "@/lib/limits";

describe("parseTags", () => {
  it("splits on commas, trims, and drops empties", () => {
    expect(parseTags(" work,  ideas ,, focus ")).toEqual([
      "work",
      "ideas",
      "focus",
    ]);
  });

  it("returns an empty array for nullish/blank input", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
    expect(parseTags(",,")).toEqual([]);
  });

  it("de-duplicates while preserving first-seen order", () => {
    expect(parseTags("a, b, a, c, b")).toEqual(["a", "b", "c"]);
  });

  it("drops tags longer than LIMITS.tag", () => {
    const long = "x".repeat(LIMITS.tag + 1);
    const ok = "y".repeat(LIMITS.tag);
    expect(parseTags(`${ok}, ${long}`)).toEqual([ok]);
  });

  it("caps the number of tags at LIMITS.tagsCount", () => {
    const many = Array.from({ length: LIMITS.tagsCount + 5 }, (_, i) => `t${i}`);
    expect(parseTags(many.join(","))).toHaveLength(LIMITS.tagsCount);
  });
});

describe("uniqueTags", () => {
  it("collects distinct tags across items, sorted case-insensitively", () => {
    const items = [
      { tags: ["Work", "ideas"] },
      { tags: ["focus", "work"] },
      { tags: [] },
    ];
    expect(uniqueTags(items)).toEqual(["focus", "ideas", "Work", "work"]);
  });

  it("tolerates items with missing tag arrays", () => {
    const items = [{ tags: ["a"] }, { tags: undefined as unknown as string[] }];
    expect(uniqueTags(items)).toEqual(["a"]);
  });

  it("returns an empty array when there are no tags", () => {
    expect(uniqueTags([{ tags: [] }, { tags: [] }])).toEqual([]);
  });
});

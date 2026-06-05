import { describe, it, expect } from "vitest";
import { cn, sanitizeSearch, getInitials } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe(
      "text-sm font-bold",
    );
  });
});

describe("sanitizeSearch", () => {
  it("strips PostgREST-significant chars and collapses whitespace", () => {
    expect(sanitizeSearch("  hello,  world  ")).toBe("hello world");
    expect(sanitizeSearch("a%b(c)d*e,f")).toBe("a b c d e f");
  });

  it("returns an empty string for blank input", () => {
    expect(sanitizeSearch("   ")).toBe("");
  });
});

describe("getInitials", () => {
  it("uses the first letter of the first two words", () => {
    expect(getInitials("Ada Lovelace")).toBe("AL");
  });

  it("uses up to two letters for a single token", () => {
    expect(getInitials("alex")).toBe("AL");
  });

  it("derives initials from an email handle", () => {
    expect(getInitials("zoe@example.com")).toBe("ZO");
  });

  it("falls back to 'U' for empty input", () => {
    expect(getInitials("")).toBe("U");
    expect(getInitials("   ")).toBe("U");
  });
});

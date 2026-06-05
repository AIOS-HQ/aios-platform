import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/harmony/os/slug";
import { buildStandardDepartmentSeed } from "@/lib/harmony/os/seed";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("AirBid")).toBe("airbid");
    expect(slugify("AIOS Platform")).toBe("aios-platform");
    expect(slugify("  Hello,  World!  ")).toBe("hello-world");
  });

  it("strips accents", () => {
    expect(slugify("Peña Ventures")).toBe("pena-ventures");
    expect(slugify("Café")).toBe("cafe");
  });

  it("falls back via uniqueSlug for empty results", () => {
    expect(slugify("***")).toBe("");
    expect(uniqueSlug("***", [])).toBe("company");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("AirBid", [])).toBe("airbid");
    expect(uniqueSlug("AirBid", ["aios"])).toBe("airbid");
  });

  it("appends an incrementing suffix when taken", () => {
    expect(uniqueSlug("AirBid", ["airbid"])).toBe("airbid-2");
    expect(uniqueSlug("AirBid", ["airbid", "airbid-2"])).toBe("airbid-3");
  });
});

describe("buildStandardDepartmentSeed", () => {
  it("produces the 7 departments in order with ordered agents", () => {
    const seed = buildStandardDepartmentSeed();
    expect(seed).toHaveLength(7);
    expect(seed[0].key).toBe("code"); // Code is first-class / first
    seed.forEach((d, i) => {
      expect(d.position).toBe(i);
      expect(d.agents.length).toBeGreaterThan(0);
      d.agents.forEach((a, j) => expect(a.position).toBe(j));
    });
  });

  it("carries default autonomy from the catalog (0–4 scale)", () => {
    const seed = buildStandardDepartmentSeed();
    const byKey = Object.fromEntries(seed.map((d) => [d.key, d]));
    expect(byKey.marketing.autonomy_level).toBe(3);
    expect(byKey.finance.autonomy_level).toBe(0);
    expect(byKey.code.autonomy_level).toBe(2);
  });
});

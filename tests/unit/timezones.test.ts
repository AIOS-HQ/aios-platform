import { describe, it, expect } from "vitest";
import { isValidTimeZone, TIMEZONES } from "@/lib/timezones";

describe("isValidTimeZone", () => {
  it("accepts valid IANA zones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
  });

  it("rejects invalid or empty values", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("'; DROP TABLE users;--")).toBe(false);
  });

  it("accepts every curated TIMEZONES entry", () => {
    for (const tz of TIMEZONES) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  });
});

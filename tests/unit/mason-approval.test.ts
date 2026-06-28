import { describe, expect, it } from "vitest";
import { masonFounderApproved } from "@/lib/workforce/mason-approval";

describe("Mason founder approval handoff", () => {
  it("treats explicit approval form values as approved", () => {
    expect(masonFounderApproved("on")).toBe(true);
    expect(masonFounderApproved("true")).toBe(true);
    expect(masonFounderApproved("approved")).toBe(true);
  });

  it("keeps Mason unapproved by default", () => {
    expect(masonFounderApproved(null)).toBe(false);
    expect(masonFounderApproved("false")).toBe(false);
    expect(masonFounderApproved("off")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  requestOriginMatchesTrustedAuthOrigin,
  trustedAuthOrigin,
} from "@/lib/auth/origin";

const previewEnvironment = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SITE_URL: "https://aios-platform-omega.vercel.app",
  VERCEL_BRANCH_URL: "aios-platform-git-certification-air-bid.vercel.app",
  VERCEL_URL: "aios-platform-unique-air-bid.vercel.app",
};

describe("trusted authentication origins", () => {
  it("accepts exact Vercel branch and deployment origins in Preview", () => {
    expect(trustedAuthOrigin(
      "https://aios-platform-git-certification-air-bid.vercel.app",
      previewEnvironment,
    )).toBe("https://aios-platform-git-certification-air-bid.vercel.app");
    expect(trustedAuthOrigin(
      "https://aios-platform-unique-air-bid.vercel.app",
      previewEnvironment,
    )).toBe("https://aios-platform-unique-air-bid.vercel.app");
  });

  it("rejects arbitrary forwarded hosts and other Vercel projects", () => {
    expect(trustedAuthOrigin("https://attacker.example", previewEnvironment)).toBeNull();
    expect(trustedAuthOrigin(
      "https://other-project-git-certification-air-bid.vercel.app",
      previewEnvironment,
    )).toBeNull();
    expect(trustedAuthOrigin(
      "http://aios-platform-git-certification-air-bid.vercel.app",
      previewEnvironment,
    )).toBeNull();
  });

  it("preserves the canonical configured origin outside Preview", () => {
    const production = {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://aios-platform-omega.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "aios-platform-omega.vercel.app",
    };
    expect(trustedAuthOrigin("https://aios-platform-omega.vercel.app", production)).toBe(
      "https://aios-platform-omega.vercel.app",
    );
    expect(trustedAuthOrigin("https://attacker.example", production)).toBeNull();
  });

  it("compares the request only with exact environment-backed origins", () => {
    expect(requestOriginMatchesTrustedAuthOrigin(
      new Request("https://aios-platform-git-certification-air-bid.vercel.app/path"),
      previewEnvironment,
    )).toBe(true);
    expect(requestOriginMatchesTrustedAuthOrigin(
      new Request("https://attacker.example/path"),
      previewEnvironment,
    )).toBe(false);
    expect(requestOriginMatchesTrustedAuthOrigin(
      new Request("https://preview.example/path"),
      { VERCEL_ENV: "preview" },
    )).toBe("unknown");
  });
});

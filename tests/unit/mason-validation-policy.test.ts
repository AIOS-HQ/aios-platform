import { describe, expect, it } from "vitest";
import {
  defaultMasonValidationRequirements,
  getGithubCheckAliasesForRequirements,
  normalizeMasonValidationRequirements,
} from "@/lib/harmony/code/mason-validation-policy";

describe("mason validation policy", () => {
  it("provides trusted defaults", () => {
    expect(defaultMasonValidationRequirements()).toEqual(["lint", "typecheck", "tests", "i18n", "build"]);
  });

  it("normalizes canonical aliases", () => {
    expect(normalizeMasonValidationRequirements(["npm run lint", "npm run typecheck", "npm test"]))
      .toEqual(["lint", "typecheck", "tests"]);
  });

  it("rejects unknown checks", () => {
    expect(() => normalizeMasonValidationRequirements(["totally-custom-check"]))
      .toThrow(/mason_validation_requirement_untrusted/);
  });

  it("deduplicates aliases", () => {
    expect(normalizeMasonValidationRequirements(["lint", "npm run lint", "LINT"]))
      .toEqual(["lint"]);
  });

  it("supports registered milestone checks", () => {
    expect(normalizeMasonValidationRequirements(["milestone 7e certification"]))
      .toEqual(["milestone_7e_certification"]);
  });

  it("maps canonical requirements to github aliases", () => {
    expect(getGithubCheckAliasesForRequirements(["lint", "tests", "vercel_preview_comments"]))
      .toEqual(expect.arrayContaining(["lint", "tests", "vercel-preview-comments"]));
  });
});

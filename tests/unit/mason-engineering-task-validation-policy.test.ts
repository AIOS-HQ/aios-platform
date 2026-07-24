import { describe, expect, it } from "vitest";
import { createMasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";

const identity = {
  executionId: "exec-1",
  correlationId: "corr-1",
  causationId: "cause-1",
  actorId: "user-1",
  source: "harmony",
} as const;

describe("mason engineering task validation policy hardening", () => {
  it("uses trusted defaults when none are provided", () => {
    const task = createMasonEngineeringTaskContract({
      objective: "ship safely",
      repository: "AIOS-HQ/aios-platform",
      executionIdentity: identity,
      requestedOutcome: "open_pull_request",
      fileChanges: [{ path: "src/example.ts", content: "export const a = 1;" }],
    });
    expect(task.validationRequirements).toEqual(["lint", "typecheck", "tests", "i18n", "build"]);
    expect(task.requiredCheckAliases).toEqual(expect.arrayContaining(["lint", "typecheck", "tests", "i18n:check", "build"]));
  });

  it("rejects arbitrary caller injection", () => {
    expect(() =>
      createMasonEngineeringTaskContract({
        objective: "ship safely",
        repository: "AIOS-HQ/aios-platform",
        executionIdentity: identity,
        requestedOutcome: "open_pull_request",
        fileChanges: [{ path: "src/example.ts", content: "export const a = 1;" }],
        validationRequirements: ["model made this up"],
      }),
    ).toThrow(/mason_validation_requirement_untrusted/);
  });

  it("rejects unregistered milestone checks", () => {
    expect(() =>
      createMasonEngineeringTaskContract({
        objective: "ship safely",
        repository: "AIOS-HQ/aios-platform",
        executionIdentity: identity,
        requestedOutcome: "open_pull_request",
        fileChanges: [{ path: "src/example.ts", content: "export const a = 1;" }],
        validationRequirements: ["milestone_7z_certification"],
      }),
    ).toThrow(/mason_validation_requirement_untrusted/);
  });

  it("deduplicates recognized aliases", () => {
    const task = createMasonEngineeringTaskContract({
      objective: "ship safely",
      repository: "AIOS-HQ/aios-platform",
      executionIdentity: identity,
      requestedOutcome: "open_pull_request",
      fileChanges: [{ path: "src/example.ts", content: "export const a = 1;" }],
      validationRequirements: ["npm run lint", "lint", "LINT"],
    });
    expect(task.validationRequirements).toEqual(["lint"]);
    expect(task.requiredCheckAliases).toEqual(["lint"]);
  });
});

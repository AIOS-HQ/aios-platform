import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEP_KEYS,
  buildOnboardingSteps,
  onboardingProgress,
  onboardingComplete,
  nextOnboardingStep,
  type OnboardingState,
} from "@/lib/harmony/os/onboarding";

const NONE: OnboardingState = {
  hasCompany: false,
  hasDepartment: false,
  autonomyConfigured: false,
  hasObjective: false,
  hasWork: false,
  approvalReviewed: false,
};

const ALL: OnboardingState = {
  hasCompany: true,
  hasDepartment: true,
  autonomyConfigured: true,
  hasObjective: true,
  hasWork: true,
  approvalReviewed: true,
};

describe("founder onboarding checklist", () => {
  it("builds the six steps in canonical order", () => {
    const steps = buildOnboardingSteps(NONE);
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.key)).toEqual([...ONBOARDING_STEP_KEYS]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("reflects real state per step", () => {
    const steps = buildOnboardingSteps({ ...NONE, hasCompany: true, hasObjective: true });
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(byKey.hasCompany).toBe(true);
    expect(byKey.hasObjective).toBe(true);
    expect(byKey.hasWork).toBe(false);
  });

  it("computes progress", () => {
    expect(onboardingProgress(buildOnboardingSteps(NONE))).toEqual({
      done: 0,
      total: 6,
      percent: 0,
    });
    expect(onboardingProgress(buildOnboardingSteps(ALL))).toEqual({
      done: 6,
      total: 6,
      percent: 100,
    });
    const half = buildOnboardingSteps({
      ...NONE,
      hasCompany: true,
      hasDepartment: true,
      autonomyConfigured: true,
    });
    expect(onboardingProgress(half).percent).toBe(50);
  });

  it("marks complete only when every step is done", () => {
    expect(onboardingComplete(buildOnboardingSteps(ALL))).toBe(true);
    expect(onboardingComplete(buildOnboardingSteps(NONE))).toBe(false);
    expect(onboardingComplete([])).toBe(false);
  });

  it("finds the next incomplete step", () => {
    expect(nextOnboardingStep(buildOnboardingSteps(NONE))?.key).toBe("hasCompany");
    expect(
      nextOnboardingStep(buildOnboardingSteps({ ...NONE, hasCompany: true }))?.key,
    ).toBe("hasDepartment");
    expect(nextOnboardingStep(buildOnboardingSteps(ALL))).toBeNull();
  });
});

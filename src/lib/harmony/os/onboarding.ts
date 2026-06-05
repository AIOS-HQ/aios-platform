/**
 * Founder OS first-run checklist — pure + dependency-free so the step logic is
 * unit-testable. The data layer computes the booleans from real platform state
 * (companies, departments, autonomy, objectives, work, approvals); this module
 * turns them into an ordered, progress-tracked step list. No persistence — the
 * checklist is derived, never stored, so it always reflects current state.
 */
export type OnboardingState = {
  hasCompany: boolean;
  hasDepartment: boolean;
  autonomyConfigured: boolean;
  hasObjective: boolean;
  hasWork: boolean;
  approvalReviewed: boolean;
};

export type OnboardingStepKey = keyof OnboardingState;

export type OnboardingStep = {
  key: OnboardingStepKey;
  done: boolean;
};

/** Canonical step order shown in the checklist. */
export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = [
  "hasCompany",
  "hasDepartment",
  "autonomyConfigured",
  "hasObjective",
  "hasWork",
  "approvalReviewed",
] as const;

export function buildOnboardingSteps(state: OnboardingState): OnboardingStep[] {
  return ONBOARDING_STEP_KEYS.map((key) => ({ key, done: Boolean(state[key]) }));
}

export function onboardingProgress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

export function onboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

/** First not-yet-done step (the one to nudge), or null when complete. */
export function nextOnboardingStep(
  steps: OnboardingStep[],
): OnboardingStep | null {
  return steps.find((s) => !s.done) ?? null;
}

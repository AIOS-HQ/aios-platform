import type { MasonBridgeStatus } from "@/lib/harmony/code/mason-execution-bridge";

export type MasonRuntimeState =
  | "blocked"
  | "awaiting_founder_approval"
  | "ready"
  | "executing"
  | "completed"
  | "failed";

export const MASON_RUNTIME_TERMINAL_STATES: readonly MasonRuntimeState[] = [
  "blocked",
  "completed",
  "failed",
] as const;

const LEGAL_TRANSITIONS: Record<MasonRuntimeState, readonly MasonRuntimeState[]> = {
  blocked: [],
  awaiting_founder_approval: ["ready", "blocked"],
  ready: ["executing", "blocked"],
  executing: ["completed", "failed", "blocked"],
  completed: [],
  failed: [],
};

export interface MasonRuntimeTransitionResult {
  ok: boolean;
  from: MasonRuntimeState;
  to: MasonRuntimeState;
  reason: string;
}

export function normalizeMasonRuntimeState(
  state: MasonRuntimeState | MasonBridgeStatus | "pending_approval",
): MasonRuntimeState {
  if (state === "paused_for_founder_approval" || state === "pending_approval") {
    return "awaiting_founder_approval";
  }
  return state as MasonRuntimeState;
}

export function toMasonBridgeStatus(state: MasonRuntimeState): MasonBridgeStatus {
  switch (state) {
    case "awaiting_founder_approval":
      return "paused_for_founder_approval";
    case "ready":
      return "ready";
    default:
      return "blocked";
  }
}

export function isMasonTerminalState(state: MasonRuntimeState): boolean {
  return (MASON_RUNTIME_TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransitionMasonRuntimeState(
  from: MasonRuntimeState,
  to: MasonRuntimeState,
): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function transitionMasonRuntimeState(
  from: MasonRuntimeState,
  to: MasonRuntimeState,
): MasonRuntimeTransitionResult {
  if (from === to) {
    return {
      ok: true,
      from,
      to,
      reason: `Mason runtime remains in ${to}.`,
    };
  }
  if (!canTransitionMasonRuntimeState(from, to)) {
    return {
      ok: false,
      from,
      to,
      reason: `Invalid Mason runtime transition: ${from} -> ${to}.`,
    };
  }
  return {
    ok: true,
    from,
    to,
    reason: `Mason runtime transitioned ${from} -> ${to}.`,
  };
}


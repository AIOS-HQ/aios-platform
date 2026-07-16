import { describe, expect, it } from "vitest";

import {
  canTransitionMasonRuntimeState,
  normalizeMasonRuntimeState,
  toMasonBridgeStatus,
  transitionMasonRuntimeState,
} from "@/lib/harmony/code/mason-runtime-state";

describe("Mason runtime state model", () => {
  it("normalizes legacy approval aliases", () => {
    expect(normalizeMasonRuntimeState("pending_approval")).toBe("awaiting_founder_approval");
    expect(normalizeMasonRuntimeState("paused_for_founder_approval")).toBe("awaiting_founder_approval");
  });

  it("maps canonical states to bridge statuses", () => {
    expect(toMasonBridgeStatus("ready")).toBe("ready");
    expect(toMasonBridgeStatus("awaiting_founder_approval")).toBe("paused_for_founder_approval");
    expect(toMasonBridgeStatus("blocked")).toBe("blocked");
    expect(toMasonBridgeStatus("completed")).toBe("blocked");
  });

  it("allows legal transitions", () => {
    expect(canTransitionMasonRuntimeState("awaiting_founder_approval", "ready")).toBe(true);
    expect(canTransitionMasonRuntimeState("ready", "executing")).toBe(true);
    expect(canTransitionMasonRuntimeState("executing", "completed")).toBe(true);
    expect(canTransitionMasonRuntimeState("executing", "failed")).toBe(true);
  });

  it("rejects invalid transitions deterministically", () => {
    const result = transitionMasonRuntimeState("blocked", "executing");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Invalid Mason runtime transition");
  });
});

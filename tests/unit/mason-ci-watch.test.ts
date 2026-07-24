import { describe, expect, it, vi } from "vitest";

import { boundedCiPoll, createCiWatchState, type CiWatchConfig } from "@/lib/workforce/mason-ci-watch";

describe("boundedCiPoll pending exhaustion contract", () => {
  const baseConfig: CiWatchConfig = {
    maxPollAttempts: 1,
    pollDelayMs: 0,
    backoffFactor: 1,
    timeoutMs: 60_000,
  };

  it("returns latest pending sample in single-evaluation caller-owned mode", async () => {
    const state = createCiWatchState({ expectedHeadSha: "head-1" });
    const sampleFn = vi.fn(async () => ({
      status: "pending" as const,
      requiredChecksPassed: false,
      detail: "required_checks_pending",
      headSha: "head-1",
    }));

    const result = await boundedCiPoll(
      { ...baseConfig, pendingExhaustionStrategy: "return_latest_pending" },
      state,
      sampleFn,
      async () => undefined,
    );

    expect(result.final.status).toBe("pending");
    expect(result.final.detail).toBe("required_checks_pending");
    expect(result.final.requiredChecksPassed).toBe(false);
  });

  it("returns timeout when pending exhausts budget in timeout mode", async () => {
    const state = createCiWatchState({ expectedHeadSha: "head-1" });
    const sampleFn = vi.fn(async () => ({
      status: "pending" as const,
      requiredChecksPassed: false,
      detail: "required_checks_pending",
      headSha: "head-1",
    }));

    const result = await boundedCiPoll(baseConfig, state, sampleFn, async () => undefined);

    expect(result.final.status).toBe("timeout");
    expect(result.final.detail).toBe("ci_poll_timeout");
    expect(result.final.requiredChecksPassed).toBe(false);
  });
});

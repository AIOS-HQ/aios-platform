export type CiWatchStatus =
  | "pending"
  | "passed"
  | "failed"
  | "stale_head"
  | "missing_pr"
  | "evidence_fetch_failed"
  | "timeout";

export type CiWatchSample = {
  status: CiWatchStatus;
  requiredChecksPassed: boolean;
  headSha?: string | null;
  detail?: string;
};

export type CiWatchConfig = {
  maxPollAttempts: number;
  pollDelayMs: number;
  backoffFactor: number;
  timeoutMs: number;
};

export type CiWatchState = {
  pollAttempts: number;
  startedAt: number;
  expectedHeadSha?: string | null;
};

export function createCiWatchState(existing?: Partial<CiWatchState>): CiWatchState {
  return {
    pollAttempts: existing?.pollAttempts ?? 0,
    startedAt: existing?.startedAt ?? Date.now(),
    expectedHeadSha: existing?.expectedHeadSha ?? null,
  };
}

export function classifyCiWatch(
  sample: CiWatchSample,
  expectedHeadSha?: string | null,
): CiWatchSample {
  if (sample.status === "passed" && sample.requiredChecksPassed) {
    if (expectedHeadSha && sample.headSha && expectedHeadSha !== sample.headSha) {
      return {
        status: "stale_head",
        requiredChecksPassed: false,
        headSha: sample.headSha,
        detail: "stale_head_sha",
      };
    }
    return sample;
  }
  return sample;
}

export function computeNextDelayMs(config: CiWatchConfig, attempts: number): number {
  const base = Math.max(0, config.pollDelayMs);
  const factor = Math.max(1, config.backoffFactor);
  return Math.floor(base * Math.pow(factor, Math.max(0, attempts - 1)));
}

export function shouldStopPolling(state: CiWatchState, config: CiWatchConfig, sample: CiWatchSample): boolean {
  if (sample.status === "passed") return true;
  if (sample.status === "failed") return true;
  if (sample.status === "stale_head") return true;
  if (sample.status === "missing_pr") return true;
  if (sample.status === "evidence_fetch_failed") return true;
  if (state.pollAttempts >= config.maxPollAttempts) return true;
  if (Date.now() - state.startedAt >= config.timeoutMs) return true;
  return false;
}

export async function boundedCiPoll(
  config: CiWatchConfig,
  state: CiWatchState,
  sampleFn: (attempt: number) => Promise<CiWatchSample>,
  sleeper: (ms: number) => Promise<void>,
): Promise<{ final: CiWatchSample; state: CiWatchState }> {
  let attempt = state.pollAttempts;
  while (true) {
    attempt += 1;
    state.pollAttempts = attempt;

    let sample: CiWatchSample;
    try {
      sample = await sampleFn(attempt);
    } catch {
      sample = { status: "evidence_fetch_failed", requiredChecksPassed: false, detail: "ci_evidence_fetch_failed" };
    }

    const classified = classifyCiWatch(sample, state.expectedHeadSha);

    if (classified.status === "pending") {
      if (attempt >= config.maxPollAttempts || Date.now() - state.startedAt >= config.timeoutMs) {
        return {
          final: {
            status: "timeout",
            requiredChecksPassed: false,
            headSha: classified.headSha,
            detail: "ci_poll_timeout",
          },
          state,
        };
      }
      const delay = computeNextDelayMs(config, attempt);
      await sleeper(delay);
      continue;
    }

    return { final: classified, state };
  }
}

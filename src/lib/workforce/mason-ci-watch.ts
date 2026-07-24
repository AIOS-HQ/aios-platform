export type CiWatchStatus =
  | "pending"
  | "passed"
  | "failed"
  | "wrong_repository"
  | "wrong_pr"
  | "wrong_branch"
  | "stale_head"
  | "stale"
  | "superseded"
  | "ambiguous_workflow_source"
  | "foreign_repository"
  | "unrecognized_required_checks"
  | "missing_pr"
  | "evidence_fetch_failed"
  | "timeout";

export type CiObservedCheckLifecycle = "pending" | "passed" | "failed" | "ambiguous";

export type CiRequiredCheckStatus =
  | "present"
  | "missing"
  | "pending"
  | "passed"
  | "failed"
  | "stale"
  | "unrecognized"
  | "ambiguous";

export type CiObservedCheck = {
  name: string;
  status: "queued" | "in_progress" | "completed" | "unknown";
  conclusion: string | null;
  lifecycle?: CiObservedCheckLifecycle;
  headSha?: string | null;
  branch?: string | null;
  repository?: string | null;
  prNumber?: number | null;
  workflowId?: string | null;
  checkId?: string | null;
  source?: "workflow_run" | "check_run" | "unknown";
  observedAt?: string | null;
};

export type CiRequiredCheckClassification = {
  name: string;
  status: CiRequiredCheckStatus;
  observed?: CiObservedCheck | null;
  detail?: string;
};

export type CiValidationBinding = {
  repository: string;
  prNumber: number;
  branch: string;
  expectedHeadSha?: string | null;
  requiredValidationIds?: string[];
  requiredChecks: string[];
  requiredCheckAliases?: string[];
};

export type CiWatchSample = {
  status: CiWatchStatus;
  requiredChecksPassed: boolean;
  headSha?: string | null;
  repository?: string | null;
  prNumber?: number | null;
  branch?: string | null;
  observedAt?: string | null;
  checkClassifications?: CiRequiredCheckClassification[];
  terminalValidationState?: "requested" | "running" | "failed" | "passed";
  detail?: string;
};

export type CiWatchConfig = {
  maxPollAttempts: number;
  pollDelayMs: number;
  backoffFactor: number;
  timeoutMs: number;
  pendingExhaustionStrategy?: "timeout" | "return_latest_pending";
};

export type CiWatchState = {
  pollAttempts: number;
  startedAt: number;
  expectedHeadSha?: string | null;
};

type RawGithubRun = Record<string, unknown>;

function normalizeRepo(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const normalized = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, name] = normalized.split("/");
  if (!owner || !name) return null;
  return `${owner}/${name}`.toLowerCase();
}

function normalizeBranch(branch: string | null | undefined): string | null {
  if (!branch) return null;
  return branch.trim().replace(/^refs\/heads\//, "");
}

function normalizeObservedStatus(status: unknown): CiObservedCheck["status"] {
  return status === "queued" || status === "in_progress" || status === "completed" ? status : "unknown";
}

function mapLifecycle(status: CiObservedCheck["status"], conclusion: string | null): CiObservedCheckLifecycle {
  if (status === "in_progress" && conclusion == null) return "pending";
  if (status === "queued" && conclusion == null) return "pending";
  if (status === "completed" && conclusion === "success") return "passed";
  if (status === "completed" && conclusion !== "success") return "failed";
  return "ambiguous";
}

function toObservedCheck(run: RawGithubRun, defaults: { repository: string; prNumber: number; branch: string }): CiObservedCheck | null {
  if (typeof run.name !== "string" || !run.name.trim()) return null;
  const workflowId = typeof run.workflow_id === "number" || typeof run.workflow_id === "string" ? String(run.workflow_id) : null;
  const checkId = typeof run.id === "number" || typeof run.id === "string" ? String(run.id) : null;
  const headSha = typeof run.head_sha === "string" && run.head_sha.length > 0 ? run.head_sha : null;
  if (!workflowId && !checkId) return null;
  if (!headSha) return null;
  const status = normalizeObservedStatus(run.status);
  const conclusion = run.conclusion == null ? null : String(run.conclusion);

  return {
    name: run.name.trim(),
    status,
    conclusion,
    lifecycle: mapLifecycle(status, conclusion),
    headSha,
    branch: typeof run.head_branch === "string" ? run.head_branch : defaults.branch,
    repository: typeof run.repository === "string" ? run.repository : defaults.repository,
    prNumber: typeof run.pr_number === "number" ? run.pr_number : defaults.prNumber,
    workflowId,
    checkId,
    source: "workflow_run",
    observedAt:
      typeof run.updated_at === "string"
        ? run.updated_at
        : typeof run.created_at === "string"
          ? run.created_at
          : new Date().toISOString(),
  };
}

export function normalizeCiObservedChecksFromGithubRuns(
  data: Record<string, unknown> | undefined,
  defaults: { repository: string; prNumber: number; branch: string },
): CiObservedCheck[] {
  const runs = Array.isArray((data as { runs?: unknown[] } | undefined)?.runs)
    ? ((data as { runs?: Array<Record<string, unknown>> }).runs ?? [])
    : [];

  const normalized = runs
    .map((run) => toObservedCheck(run, defaults))
    .filter((entry): entry is CiObservedCheck => Boolean(entry));

  const grouped = new Map<string, CiObservedCheck[]>();
  for (const check of normalized) {
    const key = `${check.name}::${check.headSha}`;
    const current = grouped.get(key) ?? [];
    current.push(check);
    grouped.set(key, current);
  }

  const selected: CiObservedCheck[] = [];
  for (const checks of grouped.values()) {
    checks.sort((a, b) => {
      const at = Date.parse(a.observedAt ?? "");
      const bt = Date.parse(b.observedAt ?? "");
      return Number.isFinite(bt) && Number.isFinite(at) ? bt - at : 0;
    });
    const latest = checks[0];
    const sameTimestampConflict = checks.filter((check) => check.observedAt === latest.observedAt);
    if (sameTimestampConflict.length > 1) {
      const outcomes = new Set(sameTimestampConflict.map((check) => `${check.status}:${check.conclusion ?? "null"}`));
      if (outcomes.size > 1) {
        return [
          {
            name: "ambiguous-ordering",
            status: "unknown",
            conclusion: "ambiguous",
            lifecycle: "ambiguous",
            headSha: latest.headSha,
            branch: latest.branch,
            repository: latest.repository,
            prNumber: latest.prNumber,
            workflowId: null,
            checkId: null,
            source: "unknown",
            observedAt: latest.observedAt,
          },
        ];
      }
    }
    selected.push(latest);
  }

  return selected;
}

export function createCiWatchState(existing?: Partial<CiWatchState>): CiWatchState {
  return {
    pollAttempts: existing?.pollAttempts ?? 0,
    startedAt: existing?.startedAt ?? Date.now(),
    expectedHeadSha: existing?.expectedHeadSha ?? null,
  };
}

function classifyRequiredChecks(
  requiredChecks: string[],
  observedChecks: CiObservedCheck[],
  expectedHeadSha?: string | null,
): CiRequiredCheckClassification[] {
  const observedByName = new Map<string, CiObservedCheck>();
  for (const check of observedChecks) observedByName.set(check.name, check);

  return requiredChecks.map((name) => {
    const observed = observedByName.get(name);
    if (!observed) return { name, status: "missing", observed: null, detail: "required_checks_missing" };
    if (expectedHeadSha && observed.headSha && observed.headSha !== expectedHeadSha) {
      return { name, status: "stale", observed, detail: "required_check_stale" };
    }
    const lifecycle = observed.lifecycle ?? mapLifecycle(observed.status, observed.conclusion);
    if (lifecycle === "ambiguous") {
      return { name, status: "ambiguous", observed, detail: "required_check_ambiguous" };
    }
    if (lifecycle === "pending") {
      return { name, status: "pending", observed, detail: "required_check_pending" };
    }
    if (lifecycle === "failed") {
      return { name, status: "failed", observed, detail: "required_check_failed" };
    }
    return { name, status: "passed", observed, detail: "required_check_passed" };
  });
}

export function classifyCiEvidenceBinding(
  sample: CiWatchSample,
  binding: CiValidationBinding,
  observedChecks: CiObservedCheck[],
): CiWatchSample {
  const expectedRepo = normalizeRepo(binding.repository);
  const observedRepo = normalizeRepo(sample.repository ?? observedChecks[0]?.repository ?? null);
  if (!expectedRepo || !observedRepo || expectedRepo !== observedRepo) {
    return { ...sample, status: "wrong_repository", requiredChecksPassed: false, detail: "wrong_repository" };
  }

  if (observedChecks.some((check) => normalizeRepo(check.repository) !== expectedRepo)) {
    return { ...sample, status: "foreign_repository", requiredChecksPassed: false, detail: "foreign_repository" };
  }

  const observedPr = sample.prNumber ?? observedChecks[0]?.prNumber ?? null;
  if (!observedPr || observedPr !== binding.prNumber) {
    return { ...sample, status: "wrong_pr", requiredChecksPassed: false, detail: "wrong_pr" };
  }

  const expectedBranch = normalizeBranch(binding.branch);
  const observedBranch = normalizeBranch(sample.branch ?? observedChecks[0]?.branch ?? null);
  if (!expectedBranch || !observedBranch || expectedBranch !== observedBranch) {
    return { ...sample, status: "wrong_branch", requiredChecksPassed: false, detail: "wrong_branch" };
  }

  if (observedChecks.some((check) => normalizeBranch(check.branch) !== expectedBranch)) {
    return { ...sample, status: "wrong_branch", requiredChecksPassed: false, detail: "wrong_branch" };
  }

  if (binding.requiredChecks.length === 0) {
    return { ...sample, status: "unrecognized_required_checks", requiredChecksPassed: false, detail: "unrecognized_required_checks" };
  }

  if (observedChecks.some((check) => check.source === "unknown" || (!check.workflowId && !check.checkId))) {
    return { ...sample, status: "ambiguous_workflow_source", requiredChecksPassed: false, detail: "ambiguous_workflow_source" };
  }

  if (observedChecks.some((check) => check.name === "ambiguous-ordering")) {
    return { ...sample, status: "ambiguous_workflow_source", requiredChecksPassed: false, detail: "ambiguous_workflow_source" };
  }

  const classifications = classifyRequiredChecks(binding.requiredChecks, observedChecks, binding.expectedHeadSha ?? null);
  const observedHeadSha = sample.headSha ?? observedChecks[0]?.headSha ?? null;

  if (classifications.some((entry) => entry.status === "missing")) {
    return { ...sample, status: "failed", requiredChecksPassed: false, detail: "required_checks_missing", checkClassifications: classifications, headSha: observedHeadSha };
  }

  if (classifications.some((entry) => entry.status === "failed" || entry.status === "ambiguous" || entry.status === "unrecognized")) {
    return { ...sample, status: "failed", requiredChecksPassed: false, detail: "required_check_failed", checkClassifications: classifications, headSha: observedHeadSha };
  }

  if (classifications.some((entry) => entry.status === "stale")) {
    const maxObserved = observedChecks.reduce<string | null>((acc, check) => {
      if (!check.headSha) return acc;
      return !acc || check.headSha > acc ? check.headSha : acc;
    }, null);
    if (binding.expectedHeadSha && sample.headSha && maxObserved && sample.headSha === maxObserved && sample.headSha > binding.expectedHeadSha) {
      return { ...sample, status: "superseded", requiredChecksPassed: false, detail: "superseded", checkClassifications: classifications, headSha: observedHeadSha };
    }
    return { ...sample, status: "stale_head", requiredChecksPassed: false, detail: "stale", checkClassifications: classifications, headSha: observedHeadSha };
  }

  if (classifications.some((entry) => entry.status === "pending")) {
    return { ...sample, status: "pending", requiredChecksPassed: false, detail: "required_checks_pending", checkClassifications: classifications, headSha: observedHeadSha };
  }

  return { ...sample, status: "passed", requiredChecksPassed: true, detail: "required_checks_passed", checkClassifications: classifications, headSha: observedHeadSha };
}

export function classifyCiWatch(sample: CiWatchSample, expectedHeadSha?: string | null): CiWatchSample {
  if (sample.status === "passed" && sample.requiredChecksPassed) {
    if (expectedHeadSha && sample.headSha && expectedHeadSha !== sample.headSha) {
      return { status: "stale_head", requiredChecksPassed: false, headSha: sample.headSha, detail: "stale_head_sha" };
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
  if (sample.status === "stale") return true;
  if (sample.status === "superseded") return true;
  if (sample.status === "wrong_repository") return true;
  if (sample.status === "wrong_pr") return true;
  if (sample.status === "wrong_branch") return true;
  if (sample.status === "foreign_repository") return true;
  if (sample.status === "ambiguous_workflow_source") return true;
  if (sample.status === "unrecognized_required_checks") return true;
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
  const pendingExhaustionStrategy = config.pendingExhaustionStrategy ?? "timeout";
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
        if (pendingExhaustionStrategy === "return_latest_pending") {
          return {
            final: classified,
            state,
          };
        }
        return {
          final: { status: "timeout", requiredChecksPassed: false, headSha: classified.headSha, detail: "ci_poll_timeout" },
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

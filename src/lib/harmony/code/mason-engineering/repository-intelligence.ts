import type {
  RepositoryEvidenceRecord,
  RepositoryIntelligence,
  RepositoryIntelligenceLimits,
  RepositoryUnknown,
} from "./types";

export const DEFAULT_REPOSITORY_INTELLIGENCE_LIMITS: RepositoryIntelligenceLimits = Object.freeze({
  maxEvidenceRecords: 40,
  maxRelatedFiles: 30,
  maxDependencies: 60,
  maxValuesPerCategory: 30,
});

const MAX_INPUT_EVIDENCE_RECORDS = 200;

const SIGNALS = {
  api: ["api", "endpoint", "route", "webhook"],
  database: ["database", "migration", "table", "column", "rls", "supabase"],
  environment: ["environment", "env", "secret", "configuration", "config"],
  workflow: ["workflow", "ci", "github actions", "deployment", "build"],
  agent: ["mason", "harmony", "julius", "agent", "workforce"],
} as const;

function normalizeTerms(value: string): string[] {
  return [...new Set(value.slice(0, 4_000).toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ?? [])]
    .filter((term) => term.length > 1)
    .slice(0, 80);
}

function boundedLimit(value: number | undefined, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value!))) : maximum;
}

function resolveLimits(input?: Partial<RepositoryIntelligenceLimits>): RepositoryIntelligenceLimits {
  return {
    maxEvidenceRecords: boundedLimit(input?.maxEvidenceRecords, DEFAULT_REPOSITORY_INTELLIGENCE_LIMITS.maxEvidenceRecords),
    maxRelatedFiles: boundedLimit(input?.maxRelatedFiles, DEFAULT_REPOSITORY_INTELLIGENCE_LIMITS.maxRelatedFiles),
    maxDependencies: boundedLimit(input?.maxDependencies, DEFAULT_REPOSITORY_INTELLIGENCE_LIMITS.maxDependencies),
    maxValuesPerCategory: boundedLimit(input?.maxValuesPerCategory, DEFAULT_REPOSITORY_INTELLIGENCE_LIMITS.maxValuesPerCategory),
  };
}

function validRepositoryPath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith("/") && !path.includes("\\") &&
    !path.split("/").includes("..");
}

function boundedUnique(values: readonly string[], limit: number): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))]
    .map((value) => value.trim())
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

function recordScore(record: RepositoryEvidenceRecord, terms: readonly string[]): number {
  const searchable = [record.path, record.component, ...record.tags].join(" ").toLowerCase();
  return terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function includesSignal(terms: readonly string[], signals: readonly string[]): boolean {
  return signals.some((signal) => terms.some((term) => signal.includes(term) || term.includes(signal)));
}

function unknownsFor(input: {
  terms: string[];
  records: RepositoryEvidenceRecord[];
  affectedFiles: string[];
  tests: string[];
  migrations: string[];
  workflows: string[];
  apis: string[];
  environment: string[];
  agents: string[];
  invalidRecordCount: number;
}): RepositoryUnknown[] {
  const unknowns: RepositoryUnknown[] = [];
  if (input.records.length === 0) unknowns.push({ field: "repository_evidence", reason: "No bounded source-backed evidence matched the repository." });
  if (input.affectedFiles.length === 0) unknowns.push({ field: "affected_files", reason: "Affected files are not proven by available repository evidence." });
  if (input.tests.length === 0) unknowns.push({ field: "related_tests", reason: "No related test was identified in the bounded evidence set." });
  if (includesSignal(input.terms, SIGNALS.database) && input.migrations.length === 0) {
    unknowns.push({ field: "migrations", reason: "Database work was signaled but no related migration was proven." });
  }
  if (includesSignal(input.terms, SIGNALS.workflow) && input.workflows.length === 0) {
    unknowns.push({ field: "workflows", reason: "Workflow impact was signaled but no workflow was proven." });
  }
  if (includesSignal(input.terms, SIGNALS.api) && input.apis.length === 0) {
    unknowns.push({ field: "apis", reason: "API impact was signaled but no API was proven." });
  }
  if (includesSignal(input.terms, SIGNALS.environment) && input.environment.length === 0) {
    unknowns.push({ field: "environment_configuration", reason: "Environment impact was signaled but no variable name was proven." });
  }
  if (includesSignal(input.terms, SIGNALS.agent) && input.agents.length === 0) {
    unknowns.push({ field: "agent_relationships", reason: "Agent impact was signaled but no relationship was proven." });
  }
  if (input.invalidRecordCount > 0) {
    unknowns.push({ field: "discarded_evidence", reason: `${input.invalidRecordCount} unsafe or malformed repository path(s) were rejected.` });
  }
  return unknowns;
}

export function createRepositoryIntelligence(input: {
  objective: string;
  repository?: string | null;
  evidenceSnapshot: readonly RepositoryEvidenceRecord[];
  limits?: Partial<RepositoryIntelligenceLimits>;
}): RepositoryIntelligence {
  const limits = resolveLimits(input.limits);
  const terms = normalizeTerms(input.objective);
  const boundedSnapshot = input.evidenceSnapshot.slice(0, MAX_INPUT_EVIDENCE_RECORDS);
  const validRecords = boundedSnapshot.filter((record) => validRepositoryPath(record.path));
  const invalidRecordCount = boundedSnapshot.length - validRecords.length;
  const scored = validRecords
    .map((record) => ({ record, score: recordScore(record, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.path.localeCompare(right.record.path));
  const selected = scored.slice(0, limits.maxEvidenceRecords).map(({ record }) => ({ ...record }));
  const affectedFiles = scored.filter(({ score }) => score >= 2).map(({ record }) => record.path);
  const relatedFiles = boundedUnique(selected.map((record) => record.path), limits.maxRelatedFiles);
  const dependencyGraph = selected
    .flatMap((record) => (record.dependencies ?? []).filter(validRepositoryPath).map((to) => ({ from: record.path, to })))
    .sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`))
    .slice(0, limits.maxDependencies);
  const collect = (selector: (record: RepositoryEvidenceRecord) => readonly string[] | undefined) =>
    boundedUnique(selected.flatMap((record) => selector(record) ?? []), limits.maxValuesPerCategory);
  const tests = boundedUnique(selected.filter((record) => record.kind === "test").map((record) => record.path), limits.maxValuesPerCategory);
  const migrations = boundedUnique(selected.filter((record) => record.kind === "migration").map((record) => record.path), limits.maxValuesPerCategory);
  const workflows = boundedUnique([
    ...selected.filter((record) => record.kind === "workflow").map((record) => record.path),
    ...collect((record) => record.workflows),
  ], limits.maxValuesPerCategory);
  const apis = collect((record) => record.apis);
  const environment = collect((record) => record.environmentVariables);
  const agents = collect((record) => record.agentRelationships);
  const architectureBoundaries = collect((record) => record.architectureBoundaries);
  const protectedComponents = boundedUnique(
    selected.filter((record) => record.protected).map((record) => `${record.path}: ${record.component}`),
    limits.maxValuesPerCategory,
  );
  const unknowns = unknownsFor({
    terms,
    records: selected,
    affectedFiles,
    tests,
    migrations,
    workflows,
    apis,
    environment,
    agents,
    invalidRecordCount,
  });

  return {
    repository: input.repository?.trim() || null,
    objectiveTerms: terms,
    evidenceRecords: selected,
    affectedFiles: boundedUnique(affectedFiles, limits.maxRelatedFiles),
    relatedFiles,
    relatedModules: boundedUnique(selected.map((record) => record.component), limits.maxValuesPerCategory),
    dependencyGraph,
    routes: collect((record) => record.routes),
    apis,
    relatedTests: tests,
    migrations,
    workflows,
    environmentConfiguration: environment,
    agentRelationships: agents,
    architectureBoundaries,
    protectedComponents,
    unknowns,
    truncated: input.evidenceSnapshot.length > MAX_INPUT_EVIDENCE_RECORDS ||
      scored.length > limits.maxEvidenceRecords || relatedFiles.length < selected.length,
    evidenceType: selected.length > 0 ? "source_code_proof" : "unknown",
  };
}

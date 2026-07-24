import type { RepositoryEvidenceRecord } from "./types";

export const AIOS_PLATFORM_REPOSITORY = "AIOS-HQ/aios-platform";

const AIOS_MASON_REPOSITORY_EVIDENCE: readonly RepositoryEvidenceRecord[] = Object.freeze([
  {
    path: "src/lib/harmony/code/mason.ts",
    kind: "source",
    component: "Mason capability registry and native runtime planning",
    tags: ["mason", "planning", "capabilities", "architecture", "repository"],
    dependencies: ["src/lib/workforce/registry.ts", "src/lib/integrations/connectors.ts"],
    agentRelationships: ["Harmony routes engineering objectives to Mason", "Mason delegates validation to QA and Testing"],
    architectureBoundaries: ["Founder-only Mason boundary", "Branch/PR/preview/Founder approval boundary"],
    protected: true,
  },
  {
    path: "src/lib/workforce/mason-action.ts",
    kind: "source",
    component: "Founder-authorized Mason engineering request entrypoint",
    tags: ["mason", "action", "founder", "runtime", "planning", "julius"],
    dependencies: [
      "src/lib/harmony/code/mason-production-runtime.ts",
      "src/lib/julius/mason-retrieval.ts",
      "src/lib/workforce/mason-closed-loop.ts",
    ],
    environmentVariables: ["HARMONY_DEFAULT_GITHUB_REPO", "GITHUB_DEFAULT_REPO"],
    agentRelationships: ["Harmony invokes Mason", "Mason retrieves context through Julius"],
    architectureBoundaries: ["Server-only Founder authorization", "Exact approval before governed execution"],
    protected: true,
  },
  {
    path: "src/lib/workforce/mason-closed-loop.ts",
    kind: "source",
    component: "Mason governed closed-loop coordinator",
    tags: ["mason", "planning", "validation", "merge", "runtime", "ledger"],
    dependencies: ["src/lib/harmony/code/mason-production-runtime.ts"],
    agentRelationships: ["Mason records verified outcomes through Julius"],
    architectureBoundaries: ["Legal runtime state transitions", "Merge gate and irreversible-operation idempotency"],
    protected: true,
  },
  {
    path: "src/lib/harmony/code/mason-execution-bridge.ts",
    kind: "source",
    component: "Mason execution-policy bridge",
    tags: ["mason", "execution", "approval", "branch", "validation"],
    dependencies: ["src/lib/harmony/code/mason.ts", "src/lib/harmony/autonomy/mason-policy.ts"],
    architectureBoundaries: ["No mutation without Founder approval", "No direct production editing"],
    protected: true,
  },
  {
    path: "src/lib/harmony/code/mason-runtime-executor.ts",
    kind: "source",
    component: "Governed Mason runtime operation executor",
    tags: ["mason", "execution", "github", "validation", "approval"],
    dependencies: ["src/lib/harmony/code/mason-live-execution.ts", "src/lib/harmony/autonomy/mason-policy.ts"],
    architectureBoundaries: ["Central autonomy-policy enforcement", "No merge operation emitted by runtime plan"],
    protected: true,
  },
  {
    path: "src/lib/harmony/autonomy/mason-policy.ts",
    kind: "source",
    component: "Mason autonomy and approval policy mapping",
    tags: ["mason", "policy", "approval", "security", "autonomy"],
    dependencies: ["src/lib/harmony/autonomy/policy-engine.ts"],
    architectureBoundaries: ["Founder approval policy", "Destructive capability denial"],
    protected: true,
  },
  {
    path: "src/lib/julius/mason-retrieval.ts",
    kind: "source",
    component: "Company-scoped Julius retrieval for Mason",
    tags: ["mason", "julius", "retrieval", "memory", "context"],
    dependencies: ["src/lib/julius/permissions.ts"],
    agentRelationships: ["Julius supplies company-scoped context to Mason"],
    architectureBoundaries: ["Company isolation", "No cross-company memory access"],
    protected: true,
  },
  {
    path: "src/lib/evidence/model.ts",
    kind: "source",
    component: "Canonical AIOS evidence model",
    tags: ["evidence", "confidence", "certification", "runtime"],
    architectureBoundaries: ["No healthy status without evidence type"],
    protected: true,
  },
  {
    path: "src/app/api/admin/certification/evidence/route.ts",
    kind: "api",
    component: "Founder-only certification evidence API",
    tags: ["api", "route", "evidence", "founder", "runtime"],
    apis: ["GET /api/admin/certification/evidence"],
    routes: ["/api/admin/certification/evidence"],
    architectureBoundaries: ["401 unauthenticated", "403 non-Founder", "Safe allowlisted metadata only"],
    protected: true,
  },
  {
    path: "supabase/migrations/20260717000000_mason_execution_ledger.sql",
    kind: "migration",
    component: "Mason execution ledger persistence",
    tags: ["mason", "migration", "database", "ledger", "rls"],
    databaseObjects: ["mason_execution_ledger", "mason_execution_events"],
    architectureBoundaries: ["Append-only execution evidence", "RLS-protected Founder scope"],
    protected: true,
  },
  {
    path: ".github/workflows/launch-validation.yml",
    kind: "workflow",
    component: "Repository launch validation workflow",
    tags: ["workflow", "ci", "validation", "github", "build"],
    workflows: ["Launch Validation"],
    architectureBoundaries: ["Required checks before merge"],
    protected: true,
  },
  {
    path: "tests/unit/mason.test.ts",
    kind: "test",
    component: "Mason capability and governance regression tests",
    tags: ["mason", "test", "planning", "approval", "capability"],
    dependencies: ["src/lib/harmony/code/mason.ts"],
  },
  {
    path: "tests/unit/mason-closed-loop.test.ts",
    kind: "test",
    component: "Mason closed-loop behavior regression tests",
    tags: ["mason", "test", "runtime", "merge", "validation"],
    dependencies: ["src/lib/workforce/mason-closed-loop.ts"],
  },
  {
    path: "tests/unit/mason-policy.test.ts",
    kind: "test",
    component: "Mason approval and destructive-operation policy tests",
    tags: ["mason", "test", "policy", "approval", "security"],
    dependencies: ["src/lib/harmony/autonomy/mason-policy.ts"],
  },
]);

export function getDefaultMasonRepositoryEvidence(
  repository: string | null | undefined,
): readonly RepositoryEvidenceRecord[] {
  return repository?.trim().toLowerCase() === AIOS_PLATFORM_REPOSITORY.toLowerCase()
    ? AIOS_MASON_REPOSITORY_EVIDENCE
    : [];
}

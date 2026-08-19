import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/production-promotion-persistence-diagnostic.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production promotion persistence diagnostic workflow", () => {
  it("is workflow_dispatch only with strict promotion_request_id input", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("promotion_request_id:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a");
    expect(workflow).toContain("promotion_request_id_mismatch");
  });

  it("runs only read-only diagnostic script and does not invoke attestation or promotion post", () => {
    expect(workflow).toContain("scripts/ci/run-production-promotion-persistence-diagnostic.ts");
    expect(workflow).not.toContain("scripts/ci/export-persisted-promotion-approval-evidence.ts");
    expect(workflow).not.toContain("scripts/ci/produce-promotion-attestation.mjs");
    expect(workflow).not.toContain("api/admin/promotion/evidence");
    expect(workflow).not.toContain("deploy");
  });

  it("uses governed trusted-main and production secret pattern", () => {
    expect(workflow).toContain("github.repository == 'AIOS-HQ/aios-platform'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("Checkout trusted main controls");
    expect(workflow).toContain("git fetch --no-tags --prune origin main");
    expect(workflow).toContain("trusted_main_mismatch");
    expect(workflow).toContain("SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
  });

  it("publishes required diagnostic output fields", () => {
    expect(workflow).toContain("requestId");
    expect(workflow).toContain("adminReadAccess");
    expect(workflow).toContain("productionPromotionRequestsQueryable");
    expect(workflow).toContain("productionPromotionDecisionsQueryable");
    expect(workflow).toContain("previewWaiverFieldsQueryable");
    expect(workflow).toContain("waiverRuntimePathSupported");
    expect(workflow).toContain("requestExists");
    expect(workflow).toContain("founderDecisionExists");
    expect(workflow).toContain("harmonyDecisionExists");
  });
});


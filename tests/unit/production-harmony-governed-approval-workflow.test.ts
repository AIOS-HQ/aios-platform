import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/production-harmony-governed-approval.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production harmony governed approval workflow", () => {
  it("is workflow_dispatch only with immutable promotion_request_id input", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("promotion_request_id:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("promotion_request_id_missing");
    expect(workflow).toContain("promotion_request_id_mutable_alias");
  });

  it("pins execution to trusted main and production environment", () => {
    expect(workflow).toContain("github.repository == 'AIOS-HQ/aios-platform'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: production");
    expect(workflow).toContain("Checkout trusted main controls");
    expect(workflow).toContain("git fetch --no-tags --prune origin main");
    expect(workflow).toContain("trusted_main_mismatch");
  });

  it("derives canonical request id and executes governed harmony writer script", () => {
    expect(workflow).toContain("derive-governed-promotion-request-id.ts m5-bootstrap-default");
    expect(workflow).toContain("promotion_request_derivation_output_invalid");
    expect(workflow).toContain("run-governed-harmony-promotion-approval.ts");
    expect(workflow).toContain("NODE_OPTIONS=\"--conditions=react-server\"");
    expect(workflow).toContain("SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
    expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain("production-harmony-governed-approval-${{ github.run_id }}");
  });

  it("contains no deployment execution commands", () => {
    expect(workflow).not.toContain("azure/login");
    expect(workflow).not.toContain("az containerapp");
    expect(workflow).not.toContain("docker push");
    expect(workflow).not.toContain("deploy");
  });
});

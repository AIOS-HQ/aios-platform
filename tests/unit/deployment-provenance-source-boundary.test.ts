import { describe, expect, it } from "vitest";
import { validateDeploymentProvenanceSourceBoundary } from "../../scripts/ci/deployment-provenance-source-boundary.mjs";

function validMonolithicHistoricalBuildJob() {
  return {
    name: "build-and-deploy",
    status: "completed",
    conclusion: "failure",
    steps: [
      { number: 21, name: "Deploy to Azure Container Apps", conclusion: "success" },
      { number: 22, name: "Resolve deployed Azure revision identity", conclusion: "success" },
      { number: 23, name: "Build production deployment provenance input", conclusion: "success" },
      { number: 24, name: "Validate canonical production deployment provenance", conclusion: "success" },
      { number: 25, name: "Upload immutable production deployment provenance artifact", conclusion: "success" },
      { number: 26, name: "Resolve deployed production FQDN from Azure", conclusion: "success" },
      { number: 27, name: "Install trusted certification dependencies", conclusion: "success" },
      { number: 28, name: "Execute authenticated production post-live probe", conclusion: "failure" },
    ],
  };
}

describe("deployment provenance source boundary validation", () => {
  it("accepts historical monolithic job when Gate 7 deployment boundary steps succeed before later post-live failure", () => {
    const out = validateDeploymentProvenanceSourceBoundary(validMonolithicHistoricalBuildJob());
    expect(out.ok).toBe(true);
    expect(out.sourceJobName).toBe("build-and-deploy");
    expect(out.requiredGate7Steps).toContain("Deploy to Azure Container Apps");
    expect(out.gate7BoundaryStep).toBe("Upload immutable production deployment provenance artifact");
  });

  it("rejects when deployment step fails", () => {
    const failingDeployment = validMonolithicHistoricalBuildJob();
    failingDeployment.steps[0] = {
      ...failingDeployment.steps[0],
      conclusion: "failure",
    };

    expect(() => validateDeploymentProvenanceSourceBoundary(failingDeployment)).toThrow(
      /deployment_provenance_source_gate7_step_not_success:Deploy to Azure Container Apps/,
    );
  });

  it("rejects when deployment verification fails", () => {
    const failingVerification = validMonolithicHistoricalBuildJob();
    failingVerification.steps[1] = {
      ...failingVerification.steps[1],
      conclusion: "failure",
    };

    expect(() => validateDeploymentProvenanceSourceBoundary(failingVerification)).toThrow(
      /deployment_provenance_source_gate7_step_not_success:Resolve deployed Azure revision identity/,
    );
  });

  it("rejects when provenance validation/upload boundary is not successful", () => {
    const failingProvenanceContract = validMonolithicHistoricalBuildJob();
    failingProvenanceContract.steps[3] = {
      ...failingProvenanceContract.steps[3],
      conclusion: "failure",
    };

    expect(() => validateDeploymentProvenanceSourceBoundary(failingProvenanceContract)).toThrow(
      /deployment_provenance_source_gate7_step_not_success:Validate canonical production deployment provenance/,
    );

    const failingProvenanceUpload = validMonolithicHistoricalBuildJob();
    failingProvenanceUpload.steps[4] = {
      ...failingProvenanceUpload.steps[4],
      conclusion: "failure",
    };

    expect(() => validateDeploymentProvenanceSourceBoundary(failingProvenanceUpload)).toThrow(
      /deployment_provenance_source_gate7_step_not_success:Upload immutable production deployment provenance artifact/,
    );
  });
});


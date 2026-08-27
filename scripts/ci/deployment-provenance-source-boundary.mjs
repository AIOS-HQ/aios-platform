import { readFileSync } from "node:fs";

const REQUIRED_GATE7_SUCCESS_STEPS = [
  "Deploy to Azure Container Apps",
  "Resolve deployed Azure revision identity",
  "Build production deployment provenance input",
  "Validate canonical production deployment provenance",
  "Upload immutable production deployment provenance artifact",
];

const BOUNDARY_STEP = "Upload immutable production deployment provenance artifact";
const FAILING_STEP_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStepIndex(steps) {
  const map = new Map();
  for (const step of steps) {
    if (!isObject(step)) continue;
    const stepName = String(step.name ?? "");
    if (stepName.trim() === "") continue;
    if (!map.has(stepName)) {
      map.set(stepName, step);
    }
  }
  return map;
}

function stepConclusion(step) {
  return String(step?.conclusion ?? "").trim();
}

function stepNumber(step) {
  const value = Number(step?.number);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function firstFailureAtOrBeforeBoundary(steps, boundaryNumber) {
  for (const step of steps) {
    if (!isObject(step)) continue;
    const conclusion = stepConclusion(step);
    if (!FAILING_STEP_CONCLUSIONS.has(conclusion)) continue;
    const number = stepNumber(step);
    if (number === null) continue;
    if (number <= boundaryNumber) {
      return { number, name: String(step.name ?? ""), conclusion };
    }
  }
  return null;
}

export function validateDeploymentProvenanceSourceBoundary(job) {
  if (!isObject(job)) fail("deployment_provenance_source_build_and_deploy_job_invalid");

  const jobName = String(job.name ?? "");
  if (jobName !== "build-and-deploy") fail("deployment_provenance_source_build_and_deploy_job_invalid");

  const jobStatus = String(job.status ?? "");
  if (jobStatus !== "completed") fail("deployment_provenance_source_build_and_deploy_job_not_completed");

  if (!Array.isArray(job.steps) || job.steps.length === 0) fail("deployment_provenance_source_build_and_deploy_steps_missing");

  const steps = job.steps;
  const stepIndex = asStepIndex(steps);

  for (const requiredStepName of REQUIRED_GATE7_SUCCESS_STEPS) {
    const requiredStep = stepIndex.get(requiredStepName);
    if (!requiredStep) {
      fail(`deployment_provenance_source_gate7_step_missing:${requiredStepName}`);
    }
    if (stepConclusion(requiredStep) !== "success") {
      fail(`deployment_provenance_source_gate7_step_not_success:${requiredStepName}`);
    }
  }

  const boundaryStep = stepIndex.get(BOUNDARY_STEP);
  const boundaryNumber = stepNumber(boundaryStep);
  if (boundaryNumber === null) fail("deployment_provenance_source_gate7_boundary_step_invalid");

  const earlyFailure = firstFailureAtOrBeforeBoundary(steps, boundaryNumber);
  if (earlyFailure) {
    fail(`deployment_provenance_source_pre_gate7_failure:${earlyFailure.name}`);
  }

  return {
    ok: true,
    sourceJobName: "build-and-deploy",
    gate7BoundaryStep: BOUNDARY_STEP,
    requiredGate7Steps: REQUIRED_GATE7_SUCCESS_STEPS,
  };
}

function main() {
  const command = process.argv[2];
  if (command !== "validate") {
    throw new Error("usage: deployment-provenance-source-boundary.mjs validate <source-build-job-json>");
  }

  const sourceBuildJobPath = process.argv[3];
  if (!sourceBuildJobPath) {
    throw new Error("usage: deployment-provenance-source-boundary.mjs validate <source-build-job-json>");
  }

  const sourceBuildJob = JSON.parse(readFileSync(sourceBuildJobPath, "utf8"));
  const output = validateDeploymentProvenanceSourceBoundary(sourceBuildJob);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const message = error?.code ?? error?.message ?? String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}


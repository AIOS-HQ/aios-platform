import { describe, expect, it } from "vitest";
import { classifyValidationFailure, mapCiStatusToValidationState } from "@/lib/harmony/code/mason-runtime-state";

describe("mason runtime validation lifecycle mapping", () => {
  it("maps requested/discovered/running semantics away from passed", () => {
    expect(mapCiStatusToValidationState("pending")).toBe("running");
    expect(mapCiStatusToValidationState("failed")).toBe("failed");
    expect(mapCiStatusToValidationState("passed")).toBe("passed");
  });

  it("maps stale and incomplete states", () => {
    expect(mapCiStatusToValidationState("stale_head")).toBe("stale");
    expect(mapCiStatusToValidationState("superseded")).toBe("stale");
    expect(mapCiStatusToValidationState("missing_pr")).toBe("incomplete");
    expect(mapCiStatusToValidationState("evidence_fetch_failed")).toBe("incomplete");
  });

  it("maps blocked binding failures", () => {
    expect(mapCiStatusToValidationState("wrong_repository")).toBe("blocked");
    expect(mapCiStatusToValidationState("wrong_pr")).toBe("blocked");
    expect(mapCiStatusToValidationState("wrong_branch")).toBe("blocked");
  });
});

describe("mason validation deterministic failure taxonomy", () => {
  it("classifies wrong repository deterministically", () => {
    const failure = classifyValidationFailure({ status: "failed", detail: "ci_wrong_repository" });
    expect(failure.code).toBe("wrong_repository");
    expect(failure.retriable).toBe(false);
  });

  it("classifies timeout deterministically", () => {
    const failure = classifyValidationFailure({ status: "timeout", detail: "ci_poll_timeout" });
    expect(failure.code).toBe("timeout");
    expect(failure.retriable).toBe(true);
  });

  it("classifies check failures using check identity", () => {
    expect(classifyValidationFailure({ status: "failed", detail: "required_check_failed", checkName: "lint" }).code).toBe("lint_failed");
    expect(classifyValidationFailure({ status: "failed", detail: "required_check_failed", checkName: "typecheck" }).code).toBe("typecheck_failed");
    expect(classifyValidationFailure({ status: "failed", detail: "required_check_failed", checkName: "tests" }).code).toBe("tests_failed");
    expect(classifyValidationFailure({ status: "failed", detail: "required_check_failed", checkName: "i18n:check" }).code).toBe("i18n_failed");
    expect(classifyValidationFailure({ status: "failed", detail: "required_check_failed", checkName: "build" }).code).toBe("build_failed");
  });
});

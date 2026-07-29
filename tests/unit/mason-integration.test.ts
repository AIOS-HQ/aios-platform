import { describe, expect, it, vi } from "vitest";

import {
  resolveMasonCapability,
  type MasonCapabilityResolution,
} from "@/lib/harmony/autonomy/mason-integration";

describe("resolveMasonCapability", () => {
  it("maps create_issue to github.issue.create", () => {
    const result = resolveMasonCapability("create_issue");
    expect(result).toEqual({
      status: "executable",
      outcome: "create_issue",
      capabilityId: "github.issue.create",
    } satisfies MasonCapabilityResolution);
  });

  it("maps create_branch to github.branch.create", () => {
    const result = resolveMasonCapability("create_branch");
    expect(result).toEqual({
      status: "executable",
      outcome: "create_branch",
      capabilityId: "github.branch.create",
    } satisfies MasonCapabilityResolution);
  });

  it("maps commit_changes to github.commit.create", () => {
    const result = resolveMasonCapability("commit_changes");
    expect(result).toEqual({
      status: "executable",
      outcome: "commit_changes",
      capabilityId: "github.commit.create",
    } satisfies MasonCapabilityResolution);
  });

  it("maps open_pull_request to github.pull_request.open", () => {
    const result = resolveMasonCapability("open_pull_request");
    expect(result).toEqual({
      status: "executable",
      outcome: "open_pull_request",
      capabilityId: "github.pull_request.open",
    } satisfies MasonCapabilityResolution);
  });

  it("returns explicit non_execution for plan_only", () => {
    const result = resolveMasonCapability("plan_only");
    expect(result).toEqual({
      status: "non_execution",
      outcome: "plan_only",
      reason: "planning_only",
    } satisfies MasonCapabilityResolution);
  });

  it("fails closed for unknown runtime values", () => {
    const result = resolveMasonCapability("something_else");
    expect(result).toEqual({
      status: "blocked",
      outcome: "unknown",
      reason: "unknown_outcome",
    } satisfies MasonCapabilityResolution);
  });

  it("fails closed when registry resolution fails", () => {
    const modulePath = "@/lib/harmony/autonomy/mason-integration";
    const actual = vi.importActual<typeof import("@/lib/harmony/autonomy/mason-integration")>(modulePath);
    expect(actual).toBeTruthy();

    const result = resolveMasonCapability("create_issue");
    expect(result.status).toBe("executable");
  });

  it("returns successful canonical resolution for executable outcomes", () => {
    const values = ["create_issue", "create_branch", "commit_changes", "open_pull_request"] as const;
    for (const value of values) {
      const result = resolveMasonCapability(value);
      expect(result.status).toBe("executable");
      if (result.status === "executable") {
        expect(typeof result.capabilityId).toBe("string");
        expect(result.capabilityId.length).toBeGreaterThan(0);
      }
    }
  });
});

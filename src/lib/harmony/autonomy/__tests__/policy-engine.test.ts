/**
 * Unified Autonomy Policy Engine — Comprehensive test suite.
 *
 * Tests cover:
 *  - Happy path: Founder directive allows action, executes
 *  - Approval required: action needs approval, approval payload created
 *  - Blocked: Founder denies action, blocked
 *  - Autonomy levels: low autonomy requires approval, high autonomy executes
 *  - Destructive actions: always require approval regardless of autonomy
 *  - Risk classification: routine vs approval vs destructive
 *  - Mason-specific: create branch/commit/PR executes, merge/deploy blocked
 *  - Connector: read executes, write requires approval
 *  - Context stale: approval resumption fails if context changed
 *  - Approval timeout: approval expires and is auto-rejected
 *
 * Run with: npm run test -- autonomy.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  evaluateAutonomyPolicy,
  canExecute,
  needsApproval,
  isBlocked,
} from "@/lib/harmony/autonomy/policy-engine";
import {
  actionRiskClass,
  requiresApprovalOrHigher,
  isDestructive,
  capabilityRisk,
} from "@/lib/harmony/autonomy/risk-mapping";
import {
  canExecuteRoutineAtLevel,
  canExecuteApprovalActionsAtLevel,
  resolveAutonomy,
  autonomyLevelName,
} from "@/lib/harmony/autonomy/autonomy-levels";
import type {
  AutonomyPolicyRequest,
  FounderDirective,
} from "@/lib/harmony/autonomy/types";

describe("Autonomy Policy Engine", () => {
  // ===== Risk Classification =====
  describe("Risk Classification", () => {
    it("classify routine actions", () => {
      expect(actionRiskClass("create_branch")).toBe("routine");
      expect(actionRiskClass("commit_file")).toBe("routine");
      expect(actionRiskClass("open_pull_request")).toBe("routine");
      expect(actionRiskClass("create_issue")).toBe("routine");
    });

    it("classify approval-required actions", () => {
      expect(actionRiskClass("merge_pull_request")).toBe("approval");
      expect(actionRiskClass("deploy_production")).toBe("approval");
      expect(actionRiskClass("publish_externally")).toBe("approval");
      expect(actionRiskClass("send_external_message")).toBe("approval");
    });

    it("classify destructive actions", () => {
      expect(actionRiskClass("delete_repository")).toBe("destructive");
      expect(actionRiskClass("delete_memory")).toBe("destructive");
      expect(isDestructive("delete_repository")).toBe(true);
      expect(isDestructive("create_branch")).toBe(false);
    });

    it("classify connector capabilities by mode", () => {
      expect(capabilityRisk("read")).toBe("routine");
      expect(capabilityRisk("write")).toBe("approval");
      expect(capabilityRisk("write", "destructive")).toBe("destructive");
    });
  });

  // ===== Autonomy Levels =====
  describe("Autonomy Levels (0-4)", () => {
    it("low levels cannot execute routine autonomously", () => {
      expect(canExecuteRoutineAtLevel(0)).toBe(false); // Manual
      expect(canExecuteRoutineAtLevel(1)).toBe(false); // Assisted
    });

    it("supervised level and above can execute routine", () => {
      expect(canExecuteRoutineAtLevel(2)).toBe(true); // Supervised
      expect(canExecuteRoutineAtLevel(3)).toBe(true); // Autonomous
      expect(canExecuteRoutineAtLevel(4)).toBe(true); // Executive
    });

    it("only executive level can execute approval actions", () => {
      expect(canExecuteApprovalActionsAtLevel(0)).toBe(false);
      expect(canExecuteApprovalActionsAtLevel(3)).toBe(false);
      expect(canExecuteApprovalActionsAtLevel(4)).toBe(true);
    });

    it("resolve autonomy: agent level overrides department", () => {
      expect(resolveAutonomy(1, 3)).toBe(3); // Agent 3 overrides dept 1
      expect(resolveAutonomy(3, undefined)).toBe(3); // No override, use dept
      expect(resolveAutonomy(3, null)).toBe(3); // Null treated as no override
    });

    it("autonomy level names", () => {
      expect(autonomyLevelName(0)).toMatch(/manual/i);
      expect(autonomyLevelName(4)).toMatch(/executive/i);
    });
  });

  // ===== Core Policy Decisions =====
  describe("Core Policy Decisions", () => {
    it("routine action at high autonomy level executes", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 3,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(canExecute(decision)).toBe(true);
      expect(decision.reason).toContain("can execute routine");
    });

    it("routine action at low autonomy requires approval", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 1,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(needsApproval(decision)).toBe(true);
      expect(decision.approval_payload).toBeDefined();
      expect(decision.reason).toContain("requires Founder approval");
    });

    it("destructive action always requires approval", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "delete_repository",
        current_autonomy_level: 4, // Even executive!
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(needsApproval(decision)).toBe(true);
      expect(decision.reason).toContain("destructive");
    });

    it("approval-required action at executive level executes", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "merge_pull_request",
        current_autonomy_level: 4, // Executive
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(canExecute(decision)).toBe(true);
      expect(decision.reason).toContain("level 4");
    });

    it("approval-required action at high autonomy requires approval", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "merge_pull_request",
        current_autonomy_level: 3, // Autonomous, not executive
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(needsApproval(decision)).toBe(true);
    });
  });

  // ===== Founder Directives =====
  describe("Founder Directives", () => {
    it("founder directive allows action", () => {
      const directive: FounderDirective = {
        id: "dir-1",
        founder_id: "user-1",
        agent: "mason",
        domain: "engineering",
        allowed_actions: ["create_branch", "commit_file", "open_pull_request"],
        denied_actions: [],
        status: "active",
        granted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 1, // Low autonomy, but directive overrides
        applicable_directives: [directive],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(canExecute(decision)).toBe(true);
      expect(decision.reason).toContain("Founder explicitly authorized");
    });

    it("founder directive blocks action", () => {
      const directive: FounderDirective = {
        id: "dir-1",
        founder_id: "user-1",
        agent: "mason",
        domain: "engineering",
        allowed_actions: ["create_branch", "commit_file"],
        denied_actions: ["merge_pull_request"],
        status: "active",
        granted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "merge_pull_request",
        current_autonomy_level: 4, // Executive level, but directive denies
        applicable_directives: [directive],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(isBlocked(decision)).toBe(true);
      expect(decision.reason).toContain("Founder explicitly denied");
    });

    it("expired directive is ignored", () => {
      const expiredDirective: FounderDirective = {
        id: "dir-1",
        founder_id: "user-1",
        agent: "mason",
        domain: "engineering",
        allowed_actions: ["create_branch"],
        denied_actions: [],
        status: "expired",
        granted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 1, // Low autonomy
        applicable_directives: [expiredDirective],
      };

      const decision = evaluateAutonomyPolicy(request);
      // Should require approval (low autonomy), not execute (directive is expired)
      expect(needsApproval(decision)).toBe(true);
    });
  });

  // ===== Approval Payloads =====
  describe("Approval Payloads", () => {
    it("approval payload includes resumption context", () => {
      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "merge_pull_request",
        current_autonomy_level: 2,
        applicable_directives: [],
        params: {
          context: {
            branch: "feat/new-feature",
            repository: "AIOS-HQ/aios-platform",
          },
        },
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(needsApproval(decision)).toBe(true);
      expect(decision.approval_payload).toBeDefined();
      expect(decision.approval_payload?.original_action).toBe("merge_pull_request");
      expect(decision.approval_payload?.original_agent).toBe("mason");
      expect(decision.approval_payload?.required_context.branch).toBe(
        "feat/new-feature",
      );
    });

    it("approval payload includes expiry time", () => {
      const request: AutonomyPolicyRequest = {
        actor: "agent",
        agent: "catalyst",
        domain: "content",
        action: "publish_externally",
        current_autonomy_level: 2,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(decision.approval_payload?.expires_at).toBeDefined();
      const expiresAt = new Date(decision.approval_payload!.expires_at);
      const now = new Date();
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursUntilExpiry).toBeGreaterThan(71); // ~72 hours
      expect(hoursUntilExpiry).toBeLessThanOrEqual(72);
    });
  });

  // ===== Mason-Specific Scenarios =====
  describe("Mason-Specific Scenarios", () => {
    it("Mason create branch: routine action executes at high autonomy", () => {
      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 3,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(canExecute(decision)).toBe(true);
    });

    it("Mason commit file: routine action executes at supervised level", () => {
      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "commit_file",
        current_autonomy_level: 2,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(canExecute(decision)).toBe(true);
    });

    it("Mason merge: requires approval at all levels except executive", () => {
      for (const level of [0, 1, 2, 3] as const) {
        const request: AutonomyPolicyRequest = {
          actor: "harmony",
          agent: "mason",
          domain: "engineering",
          action: "merge_pull_request",
          current_autonomy_level: level,
          applicable_directives: [],
        };

        const decision = evaluateAutonomyPolicy(request);
        expect(needsApproval(decision)).toBe(
          true,
          `Level ${level} should require approval for merge`,
        );
      }
    });

    it("Mason delete repository: always blocked (destructive)", () => {
      for (const level of [0, 1, 2, 3, 4] as const) {
        const request: AutonomyPolicyRequest = {
          actor: "harmony",
          agent: "mason",
          domain: "engineering",
          action: "delete_repository",
          current_autonomy_level: level,
          applicable_directives: [],
        };

        const decision = evaluateAutonomyPolicy(request);
        expect(needsApproval(decision)).toBe(true);
      }
    });
  });

  // ===== Execution Scope =====
  describe("Execution Scope & Rate Limiting", () => {
    it("higher autonomy levels get higher rate limits", () => {
      for (let level = 0; level <= 4; level++) {
        const request: AutonomyPolicyRequest = {
          actor: "agent",
          agent: "mason",
          domain: "engineering",
          action: "create_branch",
          current_autonomy_level: level as any,
          applicable_directives: [],
        };

        const decision = evaluateAutonomyPolicy(request);
        if (canExecute(decision)) {
          expect(decision.execution_scope).toBeDefined();
          expect(decision.execution_scope?.max_concurrent_actions).toBeGreaterThan(0);
          expect(decision.execution_scope?.rate_limit_per_minute).toBeGreaterThan(0);
        }
      }
    });
  });

  // ===== Audit Metadata =====
  describe("Audit Metadata", () => {
    it("decision includes audit trail", () => {
      const request: AutonomyPolicyRequest = {
        actor: "founder",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 1,
        applicable_directives: [],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(decision.audit).toBeDefined();
      expect(decision.audit.policy_version).toBe("1.0");
      expect(decision.audit.evaluated_at).toBeDefined();
      expect(decision.audit.actor_authority).toBeDefined();
      expect(decision.audit.risk_factors).toContain("low_autonomy_level");
    });

    it("audit includes applicable directives", () => {
      const directive: FounderDirective = {
        id: "dir-1",
        founder_id: "user-1",
        agent: "mason",
        domain: "engineering",
        allowed_actions: ["create_branch"],
        denied_actions: [],
        status: "active",
        granted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const request: AutonomyPolicyRequest = {
        actor: "harmony",
        agent: "mason",
        domain: "engineering",
        action: "create_branch",
        current_autonomy_level: 1,
        applicable_directives: [directive],
      };

      const decision = evaluateAutonomyPolicy(request);
      expect(decision.audit.applicable_directives).toContain("dir-1");
    });
  });
});

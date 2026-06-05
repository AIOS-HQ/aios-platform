import { describe, it, expect } from "vitest";
import {
  AUTONOMY_LEVELS,
  autonomyKey,
  clampAutonomy,
  isAutonomyLevel,
  requiresApproval,
  resolveAutonomy,
  type AutonomyLevel,
} from "@/lib/harmony/os/autonomy";
import {
  ACTIVITY_KINDS,
  APPROVAL_TYPES,
  DEPARTMENT_KEYS,
  DEPARTMENT_TEMPLATES,
  getDepartmentTemplate,
  WORK_STATUSES,
} from "@/lib/harmony/os/catalog";

describe("autonomy", () => {
  it("defines five ordered levels 0–4", () => {
    expect(AUTONOMY_LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4]);
    expect(autonomyKey(0)).toBe("manual");
    expect(autonomyKey(3)).toBe("operator");
    expect(autonomyKey(4)).toBe("executive");
  });

  it("validates and clamps levels", () => {
    expect(isAutonomyLevel(2)).toBe(true);
    expect(isAutonomyLevel(4)).toBe(true);
    expect(isAutonomyLevel(5)).toBe(false);
    expect(isAutonomyLevel("2")).toBe(false);
    expect(clampAutonomy(-3)).toBe(0);
    expect(clampAutonomy(9)).toBe(4);
    expect(clampAutonomy(1.6)).toBe(2);
    expect(clampAutonomy(Number.NaN)).toBe(0);
  });

  it("resolves agent override over department level", () => {
    expect(resolveAutonomy(2)).toBe(2);
    expect(resolveAutonomy(2, 0)).toBe(0);
    expect(resolveAutonomy(1, 3)).toBe(3);
    expect(resolveAutonomy(2, null)).toBe(2);
  });

  it("requires approval below operator, and always for high-risk", () => {
    expect(requiresApproval(0)).toBe(true);
    expect(requiresApproval(1)).toBe(true);
    expect(requiresApproval(2)).toBe(true);
    expect(requiresApproval(3)).toBe(false);
    expect(requiresApproval(4)).toBe(false);
    expect(requiresApproval(3, { highRisk: true })).toBe(true);
  });
});

describe("department catalog", () => {
  it("defines the seven initial departments with unique keys (no Engineering)", () => {
    expect(DEPARTMENT_TEMPLATES).toHaveLength(7);
    expect(new Set(DEPARTMENT_KEYS).size).toBe(7);
    for (const key of [
      "marketing",
      "operations",
      "code",
      "research",
      "sales",
      "support",
      "finance",
    ]) {
      expect(DEPARTMENT_KEYS).toContain(key);
    }
    expect(DEPARTMENT_KEYS).not.toContain("engineering");
  });

  it("encodes the default autonomy levels (0–4 scale)", () => {
    const lvl = (k: string) => getDepartmentTemplate(k)?.defaultAutonomy;
    expect(lvl("marketing")).toBe(3);
    expect(lvl("research")).toBe(3);
    expect(lvl("operations")).toBe(2);
    expect(lvl("code")).toBe(2);
    expect(lvl("finance")).toBe(0);
  });

  it("every department has a valid default autonomy and at least one agent", () => {
    for (const dept of DEPARTMENT_TEMPLATES) {
      expect(isAutonomyLevel(dept.defaultAutonomy as AutonomyLevel)).toBe(true);
      expect(dept.agents.length).toBeGreaterThan(0);
      expect(new Set(dept.agents.map((a) => a.key)).size).toBe(
        dept.agents.length,
      );
    }
  });

  it("Code department is first-class with its five agents", () => {
    const code = getDepartmentTemplate("code");
    expect(code).toBeDefined();
    expect(code?.agents.map((a) => a.key)).toEqual([
      "engineering_manager",
      "coding",
      "qa",
      "testing",
      "deployment",
    ]);
  });

  it("exposes stable work / approval / activity enums", () => {
    expect(WORK_STATUSES).toContain("awaiting_approval");
    expect(WORK_STATUSES).toHaveLength(5);
    expect(APPROVAL_TYPES).toEqual([
      "content",
      "deployment",
      "financial",
      "integration",
      "high_risk",
    ]);
    expect(ACTIVITY_KINDS).toContain("recommendation");
  });
});

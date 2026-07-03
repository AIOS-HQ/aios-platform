import { describe, expect, it } from "vitest";
import {
  connectorCapabilityRisk,
  evaluateConnectorRun,
  DEFAULT_CONNECTOR_AUTONOMY_LEVEL,
} from "@/lib/harmony/autonomy/connector-policy";
import type { ConnectorCapability } from "@/lib/integrations/connectors";

const read: ConnectorCapability = { id: "list_repos", mode: "read" };
const routineWrite: ConnectorCapability = { id: "create_branch", mode: "write", risk: "routine" };
const approvalWrite: ConnectorCapability = { id: "merge_pull_request", mode: "write", risk: "approval" };
const destructiveWrite: ConnectorCapability = { id: "delete_repository", mode: "write", risk: "destructive" };
const defaultWrite: ConnectorCapability = { id: "send_message", mode: "write" };

describe("Connector ↔ Unified Autonomy Policy Engine bridge", () => {
  it("classifies risk from capability mode + explicit risk", () => {
    expect(connectorCapabilityRisk(read)).toBe("routine");
    expect(connectorCapabilityRisk(routineWrite)).toBe("routine");
    expect(connectorCapabilityRisk(approvalWrite)).toBe("approval");
    expect(connectorCapabilityRisk(destructiveWrite)).toBe("destructive");
    // A write with no explicit risk defaults to approval.
    expect(connectorCapabilityRisk(defaultWrite)).toBe("approval");
  });

  it("executes routine and gates approval/destructive at the default connector autonomy level", () => {
    expect(DEFAULT_CONNECTOR_AUTONOMY_LEVEL).toBe(3);

    expect(evaluateConnectorRun(read)).toMatchObject({ decision: "execute", requiresApproval: false });
    expect(evaluateConnectorRun(routineWrite)).toMatchObject({ decision: "execute", requiresApproval: false });

    expect(evaluateConnectorRun(approvalWrite)).toMatchObject({
      decision: "approval_required",
      requiresApproval: true,
      destructive: false,
    });
    expect(evaluateConnectorRun(destructiveWrite)).toMatchObject({
      decision: "approval_required",
      requiresApproval: true,
      destructive: true,
    });
  });

  it("respects autonomy level: gates routine below Supervised, frees approval only at Executive", () => {
    // Manual (0) / Assisted (1): even routine needs approval.
    expect(evaluateConnectorRun(read, 0).decision).toBe("approval_required");
    expect(evaluateConnectorRun(routineWrite, 1).decision).toBe("approval_required");

    // Supervised (2): routine executes; approval-class still gated.
    expect(evaluateConnectorRun(routineWrite, 2).decision).toBe("execute");
    expect(evaluateConnectorRun(approvalWrite, 2).decision).toBe("approval_required");

    // Executive (4): approval-class executes autonomously; destructive still gated.
    expect(evaluateConnectorRun(approvalWrite, 4).decision).toBe("execute");
    expect(evaluateConnectorRun(destructiveWrite, 4).decision).toBe("approval_required");
  });
});

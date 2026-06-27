import { describe, expect, it } from "vitest";
import {
  appendOrganizationalContext,
  buildOrganizationalIntelligenceFromData,
  formatOrganizationalContext,
} from "@/lib/organizational-intelligence/engine";
import type { AgentMessage } from "@/lib/harmony/agents/a2a";
import type { WorkItem as AgentWorkItem } from "@/lib/workforce/work-queue";
import type { AgentObjective } from "@/lib/workforce/objectives";

const baseMessage: AgentMessage = {
  id: "m1",
  user_id: "u1",
  company_id: "c1",
  from_agent: "harmony",
  to_agent: "auditor",
  kind: "task",
  status: "completed",
  risk: "routine",
  parent_id: null,
  subject: "Audit launch readiness",
  body: "Review quality and launch approvals",
  context: {},
  outcome: "Completed",
  created_at: "2026-06-27T00:00:00.000Z",
  updated_at: "2026-06-27T04:00:00.000Z",
};

const blockedWork: AgentWorkItem = {
  id: "w1",
  user_id: "u1",
  company_id: "c1",
  agent: "auditor",
  objective_id: "o1",
  title: "Fix quality regression",
  detail: "Regression blocked launch QA",
  kind: "task",
  risk: "approval",
  status: "blocked",
  autonomy: "advisory",
  requires_approval: true,
  risk_level: "medium",
  category: "code",
  created_at: "2026-06-27T01:00:00.000Z",
  updated_at: "2026-06-27T03:00:00.000Z",
};

const objective: AgentObjective = {
  id: "o1",
  user_id: "u1",
  company_id: "c1",
  agent: "auditor",
  title: "Quality launch plan",
  detail: "Coordinate QA before launch",
  status: "done",
  priority: "high",
  origin: "agent",
  progress: 100,
  created_at: "2026-06-26T00:00:00.000Z",
  updated_at: "2026-06-27T00:00:00.000Z",
};

describe("organizational intelligence", () => {
  it("discovers collaboration reliability, duration, and bottlenecks", () => {
    const intelligence = buildOrganizationalIntelligenceFromData({
      messages: [baseMessage],
      agentWork: [blockedWork],
      osWork: [],
      objectives: [objective],
      approvals: [],
      activity: [],
    });

    expect(intelligence.strongestCollaboration?.agents).toEqual(["auditor", "harmony"]);
    expect(intelligence.strongestCollaboration?.reliability).toBe(100);
    expect(intelligence.metrics.averageCompletionHours).toBe(4);
    expect(intelligence.bottlenecks[0]?.id).toBe("quality");
    expect(intelligence.mostEffectivePattern?.title).toContain("quality");
  });

  it("formats planning context for Harmony prompts and plans", () => {
    const intelligence = buildOrganizationalIntelligenceFromData({
      messages: [baseMessage],
      agentWork: [],
      osWork: [],
      objectives: [objective],
      approvals: [],
      activity: [],
    });

    expect(formatOrganizationalContext(intelligence)).toContain("Strongest collaboration");
    expect(appendOrganizationalContext("Plan work", intelligence)).toContain(
      "Organizational Intelligence considered",
    );
  });
});

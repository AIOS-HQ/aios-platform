import { describe, expect, it } from "vitest";
import { generateObjectiveProposals } from "@/lib/harmony/objective-generation";
import type { AuditFinding } from "@/lib/agents/auditor/service";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";
import type { CompanySkill } from "@/lib/company-skills/library";

const organization: OrganizationalIntelligence = {
  generatedAt: "2026-06-27T00:00:00.000Z",
  windowDays: 30,
  metrics: {
    collaborations: 3,
    completedExecutions: 5,
    blockedExecutions: 2,
    approvalFrequency: 25,
    averageCompletionHours: 6,
    objectiveCompletionRate: 70,
    activitySignals: 10,
  },
  strongestCollaboration: {
    id: "harmony+mason",
    agents: ["harmony", "mason"],
    label: "Harmony + Mason",
    total: 5,
    completed: 4,
    blocked: 1,
    approvals: 1,
    reliability: 80,
    averageDurationHours: 5,
    lastSeen: "2026-06-27T00:00:00.000Z",
  },
  highestPerformingCollaboration: null,
  mostEffectivePattern: {
    id: "preview-validation",
    title: "Preview validation before release",
    detail: "Run checks and review deployment preview before release.",
    confidence: 82,
    agents: ["mason", "pulse"],
  },
  fastestImprovingMember: null,
  bottlenecks: [
    {
      id: "blocked-validation",
      title: "Validation bottleneck",
      count: 3,
      severity: "high",
      agents: ["mason", "auditor"],
      recommendation: "Create a repeatable validation workflow before release.",
    },
  ],
  collaborations: [],
  workforce: [],
  planningContext: "Validation repeatedly blocks delivery.",
};

const engineeringSkill: CompanySkill = {
  id: "engineering:preview-validation",
  title: "Preview validation workflow",
  owner_agent: "mason",
  category: "engineering",
  summary: "Validate builds and previews before release.",
  business_problem: "Releases need repeatable validation.",
  reusable_solution: "Run typecheck, tests, build, preview validation, and PR review.",
  prerequisites: ["Founder approval before merge"],
  when_to_use: ["Before deployment", "When work touches code"],
  approval_requirement: "recommended",
  confidence_score: 86,
  success_count: 4,
  failure_count: 1,
  last_used: "2026-06-27T00:00:00.000Z",
  created_from_objective: null,
  updated_at: "2026-06-27T00:00:00.000Z",
  source_entry_id: "julius_1",
};

describe("autonomous objective generation", () => {
  it("generates Founder-reviewable objectives from risk, bottleneck, and skill signals", () => {
    const auditFinding: AuditFinding = {
      id: "security-csp",
      severity: "risk",
      domain: "security",
      title: "Security headers need review",
      detail: "Production CSP should be verified before launch.",
    };

    const proposals = generateObjectiveProposals({
      auditFindings: [auditFinding],
      work: [],
      objectives: [],
      companySkills: [engineeringSkill],
      organization,
      adaptivePlan: null,
    });

    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].title).toContain("Resolve");
    expect(proposals[0].approvalRequirement).toBe("required");
    expect(proposals[0].organizationalSignals.join(" ")).toContain("Validation bottleneck");
    expect(proposals.some((proposal) => proposal.companySkillsUsed.includes("Preview validation workflow"))).toBe(true);
  });

  it("routes engineering objective opportunities to Mason and dedupes existing open objectives", () => {
    const proposals = generateObjectiveProposals({
      auditFindings: [
        {
          id: "api-debt",
          severity: "warn",
          domain: "architecture",
          title: "API integration technical debt",
          detail: "Refactor API connector code and improve tests.",
        },
      ],
      work: [],
      objectives: [
        {
          id: "existing",
          user_id: "user_1",
          company_id: "company_1",
          agent: "mason",
          title: "Resolve API integration technical debt",
          detail: null,
          status: "proposed",
          priority: "medium",
          origin: "agent",
          progress: 0,
          created_at: "2026-06-27T00:00:00.000Z",
          updated_at: "2026-06-27T00:00:00.000Z",
        },
      ],
      companySkills: [engineeringSkill],
      organization,
      adaptivePlan: null,
    });

    expect(proposals.some((proposal) => proposal.title === "Resolve API integration technical debt")).toBe(false);

    const fresh = generateObjectiveProposals({
      auditFindings: [
        {
          id: "api-debt",
          severity: "warn",
          domain: "architecture",
          title: "API integration technical debt",
          detail: "Refactor API connector code and improve tests.",
        },
      ],
      work: [],
      objectives: [],
      companySkills: [engineeringSkill],
      organization,
      adaptivePlan: null,
    });

    expect(fresh[0].recommendedOwner).toBe("mason");
    expect(fresh[0].recommendedCollaborators).toContain("auditor");
  });
});

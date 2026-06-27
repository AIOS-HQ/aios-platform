import { describe, expect, it } from "vitest";
import {
  appendSkillContext,
  explainSkillSelection,
  formatSkillContext,
  summarizeSkillConsultation,
  toSkillUsageEvidence,
  type SkillConsultation,
} from "@/lib/company-skills/utilization";
import type { CompanySkill } from "@/lib/company-skills/library";

const skill: CompanySkill = {
  id: "planning:launch-checklist",
  title: "Launch checklist",
  owner_agent: "harmony",
  category: "planning",
  summary: "Plan executive launches with reusable sequencing.",
  business_problem: "Launches need repeatable coordination.",
  reusable_solution: "Sequence launch prep, approvals, connector checks, and final review.",
  prerequisites: ["Founder approval for external publishing"],
  when_to_use: ["When planning a launch", "When coordinating executive approval"],
  approval_requirement: "recommended",
  confidence_score: 82,
  success_count: 4,
  failure_count: 1,
  last_used: "2026-06-27T00:00:00.000Z",
  created_from_objective: "obj_1",
  updated_at: "2026-06-27T00:00:00.000Z",
  source_entry_id: "julius_1",
};

describe("company skill utilization", () => {
  it("explains why a skill was selected without exposing unrelated data", () => {
    const reason = explainSkillSelection(skill, "plan launch approval workflow");
    expect(reason).toContain("matched");
    expect(reason).toContain("launch");
    expect(reason).toContain("82/100");
    expect(reason).toContain("4 success");
  });

  it("formats applied skill context for plans and prompts", () => {
    const evidence = toSkillUsageEvidence(skill, "plan launch approval workflow");
    const consultation: SkillConsultation = {
      purpose: "execution",
      query: "plan launch approval workflow",
      skills: [evidence],
      summary: summarizeSkillConsultation([evidence]),
      appliedAt: "2026-06-27T00:00:00.000Z",
    };

    expect(formatSkillContext(consultation.skills)).toContain("Launch checklist");
    expect(consultation.summary).toContain("82/100 confidence");
    expect(appendSkillContext("Prepare launch", consultation)).toContain(
      "Company Skills consulted",
    );
  });
});

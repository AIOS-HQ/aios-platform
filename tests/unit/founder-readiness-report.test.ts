import { describe, expect, it } from "vitest";

import { createFounderReadinessReport, founderReadinessAgentCount } from "@/lib/mason/founder-readiness-report";
import type { WorkforceAgentCertification } from "@/lib/workforce/certification";
import { certifyAiosWorkforce } from "@/lib/workforce/certification";

describe("founder readiness report", () => {
  it("builds from evidence-backed workforce certifications only", async () => {
    const certifications = await certifyAiosWorkforce();
    const report = createFounderReadinessReport({
      certifications: Object.values(certifications),
      generatedBy: "tests.founder_readiness",
    });

    expect(report.agents).toHaveLength(founderReadinessAgentCount());
    expect(report.canonicalPath).toBe("workforce.certification");
    expect(report.generatedBy).toBe("tests.founder_readiness");
    expect(report.agents.every((item) => item.evidenceType.length > 0)).toBe(true);
  });

  it("fails closed when any canonical agent lacks evidence", async () => {
    const certifications = await certifyAiosWorkforce();
    const trimmed = Object.values(certifications).filter((item) => item.agent.key !== "mason");
    expect(() => createFounderReadinessReport({ certifications: trimmed })).toThrow(
      "founder_readiness_missing_evidence:mason",
    );
  });

  it("does not infer production status without evidence", async () => {
    const certifications = await certifyAiosWorkforce();
    const changed = Object.values(certifications).map((item): WorkforceAgentCertification => {
      if (item.agent.key !== "mason") return item;
      return {
        ...item,
        status: "configuration_required",
        label: "Configuration required",
        blockers: [...item.blockers, "mason: missing live runtime evidence"],
      };
    });

    const report = createFounderReadinessReport({ certifications: changed });
    expect(report.founderStatus).toBe("configuration_required");
    expect(report.founderBlockers).toContain("mason: missing live runtime evidence");
  });
});


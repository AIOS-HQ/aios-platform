import { describe, expect, it } from "vitest";

import {
  classifyMasonEvidenceType,
  getMasonCapabilityRecord,
  listMasonCapabilityRecords,
} from "@/lib/mason/capability-registry";
import { AIOS_WORKFORCE } from "@/lib/workforce/registry";

describe("mason capability registry", () => {
  it("returns one canonical record per workforce agent", () => {
    const records = listMasonCapabilityRecords();
    expect(records).toHaveLength(AIOS_WORKFORCE.length);
    for (const agent of AIOS_WORKFORCE) {
      const record = getMasonCapabilityRecord(agent.key);
      expect(record.agentKey).toBe(agent.key);
      expect(Array.isArray(record.connectors)).toBe(true);
      expect(record.runtime.key).toBe(agent.key);
    }
  });

  it("keeps evidence classes explicit and deterministic", () => {
    expect(classifyMasonEvidenceType("live_runtime_proof")).toBe("live");
    expect(classifyMasonEvidenceType("authenticated_runtime_proof")).toBe("live");
    expect(classifyMasonEvidenceType("configuration_proof")).toBe("source_derived");
    expect(classifyMasonEvidenceType("source_code_proof")).toBe("source_derived");
    expect(classifyMasonEvidenceType("unknown")).toBe("simulated");
    expect(classifyMasonEvidenceType("mystery")).toBe("mocked");
  });
});


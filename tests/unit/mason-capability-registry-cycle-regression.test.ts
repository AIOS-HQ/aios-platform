import { describe, expect, it } from "vitest";

import { getMasonCapabilityRecord } from "@/lib/mason/capability-registry";
import { certifyAiosWorkforce } from "@/lib/workforce/certification";

describe("mason capability registry circular-import regression", () => {
  it("loads registry and workforce certification in same process", async () => {
    const mason = getMasonCapabilityRecord("mason");
    expect(mason.runtime.key).toBe("mason");

    const result = await certifyAiosWorkforce();
    expect(result.harmony.contract.key).toBe("harmony");
    expect(result.mason.contract.key).toBe("mason");
  });
});


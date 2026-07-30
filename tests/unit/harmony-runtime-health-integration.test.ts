import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const createClient = vi.fn();
const getTranslations = vi.fn();
const detectIntent = vi.fn();
const resolvePrimaryCompanyId = vi.fn();
const getRuntimeHealthSummary = vi.fn();
const getRuntimeHealthMetadata = vi.fn();

vi.mock("@/lib/auth/user", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next-intl/server", () => ({ getTranslations }));
vi.mock("@/lib/ai/intents", () => ({ detectIntent }));
vi.mock("@/lib/julius/wiring", () => ({
  resolvePrimaryCompanyId,
  getJuliusAwareness: vi.fn(async () => ({ total: 0, objectives: [], decisions: [], activities: [], knowledge: [] })),
}));
vi.mock("@/lib/runtime/health-api", () => ({
  internalRuntimeHealthApi: {
    getRuntimeHealthSummary,
    getRuntimeHealthMetadata,
  },
}));
vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  masonRuntimeHealth: vi.fn(async () => ({ github: true, vercel: true, harmony: true })),
}));
vi.mock("@/lib/ai/provider", () => ({
  getProvider: vi.fn(async () => ({ generate: vi.fn(async () => "ok"), supportsStreaming: false })),
  isRealProviderConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/harmony/advisor", () => ({ buildRecommendations: vi.fn(async () => []) }));
vi.mock("@/lib/harmony/reflection", () => ({ buildHarmonyReflection: vi.fn(async () => "") }));
vi.mock("@/lib/harmony/executive-workspace", () => ({ buildExecutiveWorkspace: vi.fn(async () => ({ promptContext: "" })) }));
vi.mock("@/lib/harmony/autonomous-execution-orchestrator", () => ({
  buildAutonomousExecutionOrchestration: vi.fn(async () => ({ executiveWorkspace: { promptContext: "" }, promptContext: "" })),
  isMajorExecutionSequence: vi.fn(() => false),
  recordAeoLaunchContext: vi.fn(async () => undefined),
}));
vi.mock("@/lib/harmony/os/autonomy", () => ({ requiresApproval: vi.fn(() => false) }));
vi.mock("@/lib/harmony/os/delegate-actions", () => ({ delegateToHarmony: vi.fn(async () => null) }));
vi.mock("@/lib/workforce/work-queue", () => ({ createWorkItem: vi.fn(async () => ({ id: "w1" })) }));
vi.mock("@/lib/harmony/operator-intake", () => ({
  isOversizedOperatorInput: vi.fn(() => false),
  saveOversizedInstructionAsWork: vi.fn(async () => ({ intent: "general", reply: "ok" })),
}));
vi.mock("@/lib/harmony/clarification", () => ({
  harmonyClarifyExecution: vi.fn(async () => null),
  consumePendingHarmonyClarification: vi.fn(async () => null),
}));
vi.mock("@/lib/harmony/envelope-context", () => ({ buildEnvelopePromptContext: vi.fn(async () => "") }));
vi.mock("@/lib/workforce/mason-action", () => ({ handleMasonEngineeringMessage: vi.fn(async () => null) }));
vi.mock("@/lib/harmony/code/mason", () => ({ masonOwnsEngineeringTask: vi.fn(() => false) }));
vi.mock("@/lib/auth/roles", () => ({ currentUserIsAdmin: vi.fn(async () => false) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Harmony runtime health integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    requireUser.mockResolvedValue({ id: "user-1" });
    resolvePrimaryCompanyId.mockResolvedValue("company-1");

    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "conv-1" } })
      .mockResolvedValue({ data: null });

    const insert = vi.fn(async () => ({ error: null }));

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };

    const updateChain = {
      eq: vi.fn().mockReturnThis(),
    };

    const from = vi.fn(() => ({
      select: vi.fn(() => selectChain),
      insert,
      update: vi.fn(() => updateChain),
    }));

    createClient.mockResolvedValue({ from });

    getTranslations.mockResolvedValue((key: string) => key);
    detectIntent.mockReturnValue({ intent: "general", title: "t" });

    getRuntimeHealthSummary.mockResolvedValue({
      scope: { userId: "user-1", companyId: "company-1" },
      generatedAt: "2026-07-29T00:00:00.000Z",
      status: "healthy",
      probes: [],
      categories: [
        { category: "liveness", total: 1, healthy: 1, degraded: 0, failed: 0, unknown: 0, stale: 0, status: "healthy" },
      ],
    });
    getRuntimeHealthMetadata.mockReturnValue({
      scope: { userId: "user-1", companyId: "company-1" },
      cacheKey: "[\"user-1\",\"company-1\"]",
      generatedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: "2026-07-29T00:00:30.000Z",
      ttlMs: 30_000,
      ageMs: 0,
      stale: false,
      present: true,
    });
  });

  it("delegates runtime health reads only to internal runtime health API with scope propagation", async () => {
    const { runOperator } = await import("@/lib/harmony/operator-actions");
    const result = await runOperator("show mason runtime health");

    expect(getRuntimeHealthSummary).toHaveBeenCalledWith({ userId: "user-1", companyId: "company-1" });
    expect(getRuntimeHealthMetadata).toHaveBeenCalledWith({ userId: "user-1", companyId: "company-1" });
    expect(result.reply).toContain("Mason Runtime Health");
    expect(result.reply).toContain("Status: healthy");
  });
});

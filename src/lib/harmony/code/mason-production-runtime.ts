import "server-only";

import { executeMasonRuntimePlan, type MasonRuntimeExecutorAdapters } from "@/lib/harmony/code/mason-runtime-executor";
import type { MasonLiveExecutionPlanInput } from "@/lib/harmony/code/mason-live-execution";
import { getConnections } from "@/lib/integrations/connections";

export type MasonProductionRuntimeStatus = "planning" | "waiting_founder_approval" | "completed" | "failed" | "blocked";

export interface MasonProductionRuntimeInput extends MasonLiveExecutionPlanInput {
  userId: string;
}

export interface MasonProductionRuntimeResult {
  status: MasonProductionRuntimeStatus;
  summary: string;
  pullRequestUrl: string | null;
  previewUrl: string | null;
}

export async function checkMasonConnectorHealth(userId: string) {
  const connections = await getConnections(userId);
  const connected = new Set(connections.filter((item) => item.status === "connected").map((item) => item.provider));
  return {
    github: connected.has("github"),
    vercel: connected.has("vercel") || Boolean(process.env.VERCEL_TOKEN),
    harmony: true,
  };
}

export function createUnavailableAdapters(reason: string): MasonRuntimeExecutorAdapters {
  const unavailable = async () => {
    throw new Error(reason);
  };
  return {
    github: {
      createBranch: unavailable,
      commitFile: unavailable,
      openPullRequest: unavailable,
    },
    vercel: {
      inspectPreview: unavailable,
    },
    harmony: {
      requestValidation: unavailable,
      reportOutcome: unavailable,
      recordActivity: unavailable,
      updateReviewQueue: unavailable,
      updateJuliusMemory: unavailable,
      updateCompanySkills: unavailable,
    },
  };
}

export async function runMasonProductionRuntime(
  input: MasonProductionRuntimeInput,
  adapters?: MasonRuntimeExecutorAdapters,
): Promise<MasonProductionRuntimeResult> {
  const health = await checkMasonConnectorHealth(input.userId);
  if (!health.github || !health.vercel || !health.harmony) {
    return {
      status: "blocked",
      summary: `Mason runtime blocked. Connector health: GitHub=${health.github}, Vercel=${health.vercel}, Harmony=${health.harmony}.`,
      pullRequestUrl: null,
      previewUrl: null,
    };
  }

  const result = await executeMasonRuntimePlan(
    input,
    adapters ?? createUnavailableAdapters("Production Mason adapters have not been injected."),
  );

  return {
    status: result.status === "completed" ? "completed" : result.status,
    summary: result.summary,
    pullRequestUrl: result.pullRequestUrl,
    previewUrl: result.previewUrl,
  };
}

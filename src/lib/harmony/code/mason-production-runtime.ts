import "server-only";

import { executeMasonRuntimePlan, type MasonRuntimeExecutorAdapters } from "@/lib/harmony/code/mason-runtime-executor";
import type { MasonLiveExecutionPlanInput } from "@/lib/harmony/code/mason-live-execution";
import { runConnectorCapability } from "@/lib/integrations/connector-runtime";
import { getConnections } from "@/lib/integrations/connections";
import { emitActivity } from "@/lib/harmony/os/events";
import { juliusRemember } from "@/lib/julius/wiring";
import { learnCompanySkill } from "@/lib/company-skills/library";

export interface MasonProductionRuntimeInput extends MasonLiveExecutionPlanInput {
  userId: string;
  companyId?: string | null;
}

export interface MasonProductionRuntimeResult {
  status: "completed" | "blocked" | "failed";
  summary: string;
  pullRequestUrl: string | null;
  previewUrl: string | null;
}

async function runRequiredConnector(
  userId: string,
  connectorId: string,
  capabilityId: string,
  params: Record<string, unknown>,
) {
  const result = await runConnectorCapability(userId, connectorId, capabilityId, params, { approved: true });
  if (!result.ok) throw new Error(`${connectorId}.${capabilityId}: ${result.message}`);
  return result.data ?? { ok: true };
}

export async function masonRuntimeHealth(userId: string) {
  const connections = await getConnections(userId);
  const connected = new Set(connections.filter((item) => item.status === "connected").map((item) => item.provider));
  return {
    github: connected.has("github"),
    vercel: connected.has("vercel"),
    harmony: true,
  };
}

export function createMasonProductionAdapters(input: MasonProductionRuntimeInput): MasonRuntimeExecutorAdapters {
  return {
    github: {
      createBranch(args) {
        return runRequiredConnector(input.userId, "github", "create_branch", {
          repo: args.repository,
          branch: args.branch,
          base: args.base,
        });
      },
      commitFile(args) {
        return runRequiredConnector(input.userId, "github", "commit_file_to_branch", {
          repo: args.repository,
          branch: args.branch,
          path: args.path,
          content: args.content,
          message: args.message,
        });
      },
      openPullRequest(args) {
        return runRequiredConnector(input.userId, "github", "open_pull_request", {
          repo: args.repository,
          title: args.title,
          head: args.head,
          base: args.base,
          body: args.body,
        });
      },
    },
    vercel: {
      inspectPreview(args) {
        return runRequiredConnector(input.userId, "vercel", "deployment_status", {
          repo: args.repository,
          branch: args.branch,
          objective: args.objective,
          previewUrl: args.previewUrl ?? null,
        });
      },
    },
    harmony: {
      async requestValidation(args) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: `Mason requested validation for ${args.branch}: ${args.commands.join(", ")}`,
          refType: "mason_validation",
          refId: args.branch,
        });
        return { requested: true, commands: args.commands };
      },
      async reportOutcome(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: String(payload.summary ?? "Mason runtime outcome"),
          refType: "mason_runtime",
          refId: String(payload.branch ?? "mason"),
        });
        return { reported: true };
      },
      async recordActivity(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: String(payload.summary ?? "Mason runtime activity"),
          refType: "mason_runtime",
          refId: String(payload.branch ?? "mason"),
        });
        return { recorded: true };
      },
      async updateReviewQueue(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "approval_requested",
          summary: String(payload.summary ?? "Mason runtime awaiting Founder review"),
          refType: "mason_review_queue",
          refId: String(payload.branch ?? "mason"),
        });
        return { queued: true };
      },
      async updateJuliusMemory(payload) {
        if (input.companyId) {
          await juliusRemember({
            userId: input.userId,
            companyId: input.companyId,
            agent: "mason",
            kind: "activity",
            title: "Mason runtime execution",
            content: String(payload.summary ?? "Mason runtime memory"),
            refs: { source: "mason_runtime", payload },
            importance: 4,
          });
        }
        return { remembered: Boolean(input.companyId) };
      },
      async updateCompanySkills(payload) {
        await learnCompanySkill({
          userId: input.userId,
          companyId: input.companyId ?? null,
          ownerAgent: "mason",
          title: "Mason runtime execution",
          summary: String(payload.summary ?? "Reusable Mason execution pattern"),
          outcome: String(payload.summary ?? "Mason completed runtime reporting"),
          category: "engineering",
          success: true,
          source: "manual",
          sourceId: String(payload.branch ?? "mason"),
        });
        return { learned: Boolean(input.companyId) };
      },
    },
  };
}

export async function runMasonProductionRuntime(
  input: MasonProductionRuntimeInput,
  adapters: MasonRuntimeExecutorAdapters = createMasonProductionAdapters(input),
): Promise<MasonProductionRuntimeResult> {
  const health = await masonRuntimeHealth(input.userId);
  if (!health.github || !health.vercel || !health.harmony) {
    return {
      status: "blocked",
      summary: `Mason runtime blocked. GitHub=${health.github}, Vercel=${health.vercel}, Harmony=${health.harmony}.`,
      pullRequestUrl: null,
      previewUrl: null,
    };
  }

  const result = await executeMasonRuntimePlan(input, adapters);
  return {
    status: result.status,
    summary: result.summary,
    pullRequestUrl: result.pullRequestUrl,
    previewUrl: result.previewUrl,
  };
}

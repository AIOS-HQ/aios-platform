import "server-only";

import { getJuliusContext, type JuliusEntry } from "@/lib/julius/service";
import {
  assertCompanyScope,
  createJuliusInteractionContext,
  type JuliusInteractionContext,
} from "@/lib/julius/interaction-context";

export interface MasonRetrievalInput {
  context: Omit<JuliusInteractionContext, "timestamp"> & { timestamp?: string };
  engineeringQuery: string;
}

export type MasonRetrievalResult =
  | {
      status: "found";
      context: JuliusInteractionContext;
      entries: JuliusEntry[];
      degraded: false;
      error?: undefined;
    }
  | {
      status: "empty";
      context: JuliusInteractionContext;
      entries: JuliusEntry[];
      degraded: false;
      error?: undefined;
    }
  | {
      status: "degraded";
      context: JuliusInteractionContext;
      entries: JuliusEntry[];
      degraded: true;
      error: string;
    }
  | {
      status: "failed";
      context: JuliusInteractionContext;
      entries: JuliusEntry[];
      degraded: false;
      error: string;
    };

export async function retrieveMasonExecutionContext(input: MasonRetrievalInput): Promise<MasonRetrievalResult> {
  const context = createJuliusInteractionContext(input.context);
  assertCompanyScope(context, context.company_id);

  const query = input.engineeringQuery.trim();
  if (!query) {
    return {
      status: "failed",
      context,
      entries: [],
      degraded: false,
      error: "engineering_query_required",
    };
  }

  try {
    const principal = context.user_id ?? context.actor_id ?? "";
    const entries = await getJuliusContext(principal, context.company_id, query, 8);
    if (entries.length === 0) {
      return { status: "empty", context, entries: [], degraded: false };
    }
    return { status: "found", context, entries, degraded: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "julius_retrieval_failed";
    const degraded = /migration|does not exist|relation|rpc|embedding/i.test(message);
    if (degraded) {
      return { status: "degraded", context, entries: [], degraded: true, error: message };
    }
    return { status: "failed", context, entries: [], degraded: false, error: message };
  }
}

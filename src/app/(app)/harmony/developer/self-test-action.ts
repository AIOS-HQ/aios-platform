"use server";

import crypto from "node:crypto";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { ensureProvidersRegistered } from "@/lib/integrations/providers";
import { executeCapability } from "@/lib/integrations/runtime/runtime";

export interface SelfTestResult {
  ok: boolean;
  outcome: string;
  attempts: number;
  durationMs: number;
  itemCount: number | null;
  detail: string;
}

/**
 * Admin-only, READ-ONLY runtime self-test.
 *
 * Proves the complete execution path end to end — capability → Universal
 * Runtime → authorization → connector → GitHub → telemetry → result → audit —
 * using only a read capability (`list_repos`). It NEVER modifies external
 * systems. This is the permanent runtime diagnostic: as each provider comes
 * online, point a read capability at it the same way.
 */
export async function runGithubSelfTest(): Promise<SelfTestResult> {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) {
    return {
      ok: false,
      outcome: "unauthorized",
      attempts: 0,
      durationMs: 0,
      itemCount: null,
      detail: "Admin only",
    };
  }

  ensureProvidersRegistered();

  const result = await executeCapability<Record<string, never>, unknown[]>({
    connectorId: "github",
    capabilityId: "list_repos",
    userId: user.id,
    input: {},
    correlationId: `selftest-${crypto.randomUUID()}`,
  });

  const itemCount = Array.isArray(result.data) ? result.data.length : null;
  const detail =
    result.outcome === "success"
      ? `Fetched ${itemCount ?? 0} repositories through the runtime`
      : (result.error?.message ?? result.outcome);

  return {
    ok: result.outcome === "success",
    outcome: result.outcome,
    attempts: result.attempts,
    durationMs: result.durationMs,
    itemCount,
    detail,
  };
}

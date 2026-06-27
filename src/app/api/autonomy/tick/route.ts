import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeError } from "@/lib/security/safe-error";
import {
  evaluate,
  deriveRiskLevel,
  type AutonomyGlobal,
  type AutonomyAgentSetting,
  type CategoryPolicy,
  type ActionCategory,
} from "@/lib/workforce/autonomy";

/**
 * Secured autonomy tick. Designed for an external scheduler (Vercel Cron /
 * platform live mode) but intentionally NOT wired to one — the founder decides
 * when to enable scheduling. Reuses the evaluate() engine and every guard:
 * kill switch, lockdown, per-agent budgets, category policy, risk thresholds,
 * and approval rules. Logs every decision, execution, and denial to
 * agent_autonomy_audit. Runs service-role (no user session), so every query is
 * explicitly user-scoped. Inert until AUTONOMY_TICK_SECRET is configured.
 */
export async function POST(request: Request) {
  const secret = process.env.AUTONOMY_TICK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("x-autonomy-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "no_admin_client" }, { status: 503 });
  }

  // Only tick users whose global autonomy is BOUNDED and not frozen.
  const { data: globals, error: gErr } = await admin
    .from("agent_autonomy_global")
    .select("*")
    .eq("mode", "bounded")
    .eq("kill_switch", false)
    .eq("lockdown", false);
  if (gErr) {
    logSafeError("[autonomy/tick] global query failed", gErr);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let processed = 0;
  let executed = 0;
  let pending = 0;

  for (const g of ((globals ?? []) as (AutonomyGlobal & { user_id: string })[])) {
    const userId = g.user_id;
    const [settings, categories, items, auditToday] = await Promise.all([
      admin.from("agent_autonomy_settings").select("*").eq("user_id", userId),
      admin.from("agent_autonomy_categories").select("*").eq("user_id", userId),
      admin.from("agent_work_queue").select("*").eq("user_id", userId).eq("status", "proposed").limit(200),
      admin
        .from("agent_autonomy_audit")
        .select("agent, decision, created_at")
        .eq("user_id", userId)
        .gte("created_at", todayStart.toISOString()),
    ]);

    const agents: Record<string, AutonomyAgentSetting> = {};
    for (const r of (settings.data as AutonomyAgentSetting[] | null) ?? []) agents[r.agent] = r;
    const cats: Record<string, CategoryPolicy> = {};
    for (const r of (categories.data as CategoryPolicy[] | null) ?? []) cats[r.category] = r;

    const usedToday: Record<string, number> = {};
    for (const a of (auditToday.data as { agent: string; decision: string }[] | null) ?? []) {
      if (a.decision === "auto_executed" || a.decision === "notified") {
        usedToday[a.agent] = (usedToday[a.agent] ?? 0) + 1;
      }
    }

    const rows = (items.data as {
      id: string;
      company_id: string | null;
      agent: string;
      title: string;
      risk: string;
      risk_level: string | null;
      category: string | null;
    }[] | null) ?? [];

    for (const it of rows) {
      const riskLevel = deriveRiskLevel(it.risk, it.risk_level);
      const category = (it.category ?? null) as ActionCategory | null;
      let result = category
        ? evaluate({
            category,
            riskLevel,
            global: g,
            agent: agents[it.agent] ?? null,
            categoryPolicy: cats[category] ?? null,
          })
        : { decision: "pending_approval" as const, reason: "No action category set." };

      // Budget gate (daily): even auto-eligible work waits when the budget is spent.
      if (result.decision === "auto_executed" || result.decision === "notified") {
        const limit = agents[it.agent]?.daily_action_limit ?? 0;
        if ((usedToday[it.agent] ?? 0) >= limit) {
          result = { decision: "pending_approval", reason: "Daily autonomy budget exhausted." };
        }
      }

      await admin.from("agent_autonomy_audit").insert({
        user_id: userId,
        company_id: it.company_id,
        agent: it.agent,
        action: it.title.slice(0, 300),
        category,
        risk_level: riskLevel,
        decision: result.decision,
        detail: result.reason,
        ref_type: "agent_work_item",
        ref_id: it.id,
      });

      if (result.decision === "auto_executed" || result.decision === "notified") {
        await admin.from("agent_work_queue").update({ status: "done" }).eq("id", it.id).eq("user_id", userId);
        usedToday[it.agent] = (usedToday[it.agent] ?? 0) + 1;
        executed += 1;
      } else {
        pending += 1;
      }
      processed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, executed, pending });
}

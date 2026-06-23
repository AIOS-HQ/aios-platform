import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/integrations/connections";
import { getLearningSettings } from "@/lib/memory/learning";
import { classifyTool } from "@/lib/agent/policy";
import { juliusRemember, resolvePrimaryCompanyId } from "@/lib/julius/wiring";

/**
 * Auditor — the AIOS internal auditor & system inspector (server-only).
 *
 * Runs READ-ONLY audits across governance domains and produces a founder audit
 * report with a risk posture. Owner-scoped. Never performs destructive actions.
 * Can record its run into Julius (cross-agent awareness) on demand.
 */

export type Severity = "ok" | "info" | "warn" | "risk";

export interface AuditFinding {
  domain: string;
  title: string;
  severity: Severity;
  detail: string;
}

export interface AuditReport {
  generatedAt: string;
  findings: AuditFinding[];
  counts: Record<Severity, number>;
  posture: Severity;
}

/** Config keys checked for PRESENCE only — values are never read or returned. */
const CONFIG_KEYS = [
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
];

async function loadAgentActions(
  userId: string,
): Promise<{ tool: string; status: string }[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("tool,status")
    .eq("user_id", userId)
    .limit(500);
  if (error || !data) return null;
  return data as { tool: string; status: string }[];
}

export async function runAudit(userId: string): Promise<AuditReport> {
  const findings: AuditFinding[] = [];

  // Approval + agent-action + governance audits.
  const actions = await loadAgentActions(userId);
  if (actions === null) {
    findings.push({
      domain: "approvals",
      title: "Audit log unavailable",
      severity: "warn",
      detail: "agent_actions is not reachable (migration may be pending).",
    });
  } else {
    const pending = actions.filter((a) => a.status === "pending");
    const failed = actions.filter((a) => a.status === "failed");
    const highRisk = pending.filter((a) => classifyTool(a.tool) === "destructive");
    findings.push({
      domain: "approvals",
      title: "Pending approvals",
      severity: pending.length > 0 ? "info" : "ok",
      detail: `${pending.length} action(s) awaiting founder approval.`,
    });
    if (highRisk.length > 0) {
      findings.push({
        domain: "risk",
        title: "High-risk actions pending",
        severity: "risk",
        detail: `${highRisk.length} destructive action(s) awaiting approval.`,
      });
    }
    findings.push({
      domain: "workflow",
      title: "Failed actions",
      severity: failed.length > 0 ? "warn" : "ok",
      detail: `${failed.length} failed action(s) in the recent log.`,
    });
    findings.push({
      domain: "governance",
      title: "Audit trail",
      severity: "ok",
      detail: `${actions.length} recent action(s) logged and traceable.`,
    });
  }

  // Security audit (integration connections).
  const connections = await getConnections(userId);
  findings.push({
    domain: "security",
    title: "Connected integrations",
    severity: "info",
    detail: `${connections.length} connector(s) connected. Tokens are service-role-written and never client-exposed.`,
  });

  // Configuration audit (presence only — never values).
  const missing = CONFIG_KEYS.filter((k) => !process.env[k]);
  findings.push({
    domain: "configuration",
    title: "Environment configuration",
    severity: missing.length > 0 ? "warn" : "ok",
    detail:
      missing.length > 0
        ? `${missing.length} key(s) not set: ${missing.join(", ")}.`
        : "All checked configuration keys are present.",
  });

  // Governance — learning controls.
  const learning = await getLearningSettings(userId);
  findings.push({
    domain: "governance",
    title: "Auto-learning controls",
    severity: "info",
    detail: `Learning ${learning.enabled ? "on" : "off"}; new-memory approval ${learning.requireApproval ? "required" : "not required"}.`,
  });

  // Deployment audit (requires the Vercel connector).
  findings.push({
    domain: "deployment",
    title: "Deployment monitoring",
    severity: "info",
    detail: "Connect Vercel (read-only diagnostics) to include live deployment and build status.",
  });

  const counts: Record<Severity, number> = { ok: 0, info: 0, warn: 0, risk: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const posture: Severity = counts.risk > 0 ? "risk" : counts.warn > 0 ? "warn" : "ok";

  return { generatedAt: new Date().toISOString(), findings, counts, posture };
}

/**
 * Record the latest audit into Julius (cross-agent awareness): the Auditor writes
 * an activity entry to the org brain so the rest of the workforce sees the posture.
 * Returns false if there is no company or the Julius table isn't available yet.
 */
export async function recordAuditToJulius(userId: string): Promise<boolean> {
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return false;
  const report = await runAudit(userId);
  const summary = `Auditor run — posture: ${report.posture}. ${report.counts.risk} risk, ${report.counts.warn} warn, across ${report.findings.length} checks.`;
  return juliusRemember({
    userId,
    companyId,
    agent: "auditor",
    kind: "activity",
    title: "Audit completed",
    content: summary,
    refs: { posture: report.posture, counts: report.counts },
    importance: report.posture === "risk" ? 5 : 3,
  });
}

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

/** Severity weights for the 0..100 risk score (higher = more risk). */
const SEVERITY_WEIGHT: Record<Severity, number> = { ok: 0, info: 1, warn: 8, risk: 25 };

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
  /** 0..100 risk score (higher = more risk), derived from severity weights. */
  score: number;
  /** Generated founder-facing summary of the audit. */
  summary: string;
}

function buildSummary(
  posture: Severity,
  score: number,
  counts: Record<Severity, number>,
  findings: AuditFinding[],
): string {
  const top = findings
    .filter((f) => f.severity === "risk" || f.severity === "warn")
    .slice(0, 3)
    .map((f) => f.title);
  const postureText =
    posture === "risk" ? "at risk" : posture === "warn" ? "needs attention" : "healthy";
  const head = `Posture is ${postureText} (risk score ${score}/100): ${counts.risk} risk, ${counts.warn} warning, ${counts.info} info across ${findings.length} checks.`;
  return top.length > 0
    ? `${head} Top items: ${top.join("; ")}.`
    : `${head} No warnings or risks detected.`;
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
    const total = actions.length;
    const executed = actions.filter((a) => a.status === "executed").length;
    const failRate = total > 0 ? failed.length / total : 0;
    findings.push({
      domain: "workflow",
      title: "Workflow health",
      severity: failRate >= 0.25 ? "risk" : failRate > 0 ? "warn" : "ok",
      detail: `${failed.length}/${total} action(s) failed (${Math.round(failRate * 100)}% failure rate).`,
    });
    findings.push({
      domain: "workflow",
      title: "Throughput",
      severity: "info",
      detail: `${total} recent action(s): ${executed} executed, ${pending.length} pending, ${failed.length} failed.`,
    });
    findings.push({
      domain: "governance",
      title: "Approval gate",
      severity: highRisk.length > 0 ? "warn" : "ok",
      detail:
        highRisk.length > 0
          ? `${highRisk.length} high-risk action(s) correctly held for approval.`
          : "No high-risk actions are bypassing approval.",
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

  // Deployment audit (config presence now; live status once Vercel is connected).
  const deployConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  findings.push({
    domain: "deployment",
    title: "Deployment configuration",
    severity: deployConfigured ? "info" : "warn",
    detail: deployConfigured
      ? "Production URL configured. Connect Vercel for live build/deployment status."
      : "NEXT_PUBLIC_APP_URL not set; connect Vercel for live deployment status.",
  });

  const counts: Record<Severity, number> = { ok: 0, info: 0, warn: 0, risk: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const posture: Severity = counts.risk > 0 ? "risk" : counts.warn > 0 ? "warn" : "ok";
  const score = Math.min(
    100,
    findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0),
  );
  const summary = buildSummary(posture, score, counts, findings);

  return { generatedAt: new Date().toISOString(), findings, counts, posture, score, summary };
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
  return juliusRemember({
    userId,
    companyId,
    agent: "auditor",
    kind: "activity",
    title: `Audit completed — ${report.posture} (score ${report.score}/100)`,
    content: report.summary,
    refs: { posture: report.posture, score: report.score, counts: report.counts },
    importance: report.posture === "risk" ? 5 : 3,
  });
}

/**
 * Cheap count of high-risk (destructive) actions awaiting approval. Used as a
 * sidebar risk indicator. Owner-scoped; returns 0 if the audit log is absent.
 */
export async function countHighRiskPending(userId: string): Promise<number> {
  const actions = await loadAgentActions(userId);
  if (!actions) return 0;
  return actions.filter(
    (a) => a.status === "pending" && classifyTool(a.tool) === "destructive",
  ).length;
}

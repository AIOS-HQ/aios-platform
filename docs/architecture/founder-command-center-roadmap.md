# Founder Command Center — Phase 2 Roadmap

Begins **after the Auditor agent is operational** (per founder directive). This
roadmap defines the Phase 2 surfaces, the data each draws on, and the safe build
order. Everything is owner-scoped and read-first; any action remains governed by
the Approval Center + autonomy policy.

## Goal

A single executive surface where the founder sees the state of the company(ies),
the workforce, risk, and what needs a decision — powered by Julius (organizational
brain), the OS (objectives/activity/approvals), the Auditor (risk/findings), and
the connectors (diagnostics).

## Phase 2 surfaces & data sources

| Surface | What it shows | Primary data sources |
|---|---|---|
| **Executive Summary** | One-screen state of the company: objectives in flight, pending approvals, top risks, recent decisions | Julius (objectives/decisions), OS work/activity, `agent_actions`, Auditor |
| **Daily Founder Briefing** | A generated digest (yesterday → today): what agents did, what's pending, what changed, what needs you | Julius awareness feed, `agent_actions`, OS activity, Auditor findings |
| **Company Health Dashboard** | Per-company health: objective progress, throughput, blockers, autonomy posture | OS objectives/work, departments/agents, activity |
| **Agent Health Dashboard** | Per-agent activity, success/failure, last-active, Julius contributions | `agent_actions` (by `agent`/`source`), Julius entries by agent, workforce registry |
| **Strategic Recommendations** | Prioritized, founder-approvable recommendations | Horizon (strategy) + Julius context + Auditor risk |
| **Risk Monitoring** | Live risk posture, high-risk pending actions, security/config findings | Auditor risk engine, `agent_actions` (destructive/approval), config presence |

## Build order (each an additive, green, owner-scoped PR)

1. **CC-1 — Executive Summary** (read-only aggregation over Julius + OS + Auditor).
2. **CC-2 — Risk Monitoring** (surfaces the Auditor risk engine; reuses Auditor service).
3. **CC-3 — Agent Health Dashboard** (per-agent rollup from `agent_actions` + Julius).
4. **CC-4 — Company Health Dashboard** (per-company objective/throughput rollup).
5. **CC-5 — Daily Founder Briefing** (scheduled digest; can run via a scheduled invocation, delivered in-app/Slack/email).
6. **CC-6 — Strategic Recommendations** (Horizon + Julius; every recommendation is founder-approvable).

## Dependencies / prerequisites

- **Auditor operational** (this phase) — powers Risk Monitoring + Exec Summary risk.
- **Julius applied + wired** (this phase) — powers awareness/decisions/objectives.
- `agent_actions` + `memories` migrations applied — for activity/agent rollups.
- Company context: Command Center surfaces are **company-scoped** (`/harmony`),
  so CC pages live under the company OS, not user settings.

## Governance

- All surfaces are **read-first**. Recommendations and briefings never auto-execute;
  they route through the Approval Center. Risk findings are informational + actionable
  via approvals. Owner-scoped RLS throughout; company isolation preserved.

## Status

Roadmap only. Implementation starts at **CC-1** once the Auditor is operational
and the founder approves proceeding.

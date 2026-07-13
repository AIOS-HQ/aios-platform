# AIOS Workforce Production Certification

Baseline: current `origin/main` after PR #399, merge commit `d6f0f68295d89c1bac649839d76de63c74ba4581`.

This document certifies the current AIOS workforce implementation. It is not a future Event Mesh, NATS, or portable Capability Registry design. It records what exists now, what was wired, what is blocked, and which actions remain Founder-controlled.

## Architecture Map

| Layer | Source | Certification |
| --- | --- | --- |
| Registry/source of truth | `src/lib/workforce/registry.ts`, `WORKFORCE.md` | Canonical AIOS agents are Harmony, Auditor, Mason, Catalyst, Ambassador, Atlas, Pulse, Horizon, Aegis, Ledger. Julius is not an agent. |
| Runtime certification | `src/lib/workforce/certification.ts` | Each agent exposes role, Julius access, skills, tools, connector dependencies, runtime handlers, execution capability, autonomy policy, approval policy, actionable blockers, and intentional capability boundaries. |
| Event Mesh transport | `src/lib/event-mesh/*`, `event_mesh_*` tables | Portable outbox/inbox delivery sits beneath A2A/workforce records. PostgreSQL remains authoritative; NATS JetStream is optional and replaceable. |
| Harmony delegation | `src/lib/harmony/agents/a2a.ts`, `src/lib/workforce/work-queue.ts` | Harmony can delegate tasks, attach Julius/skills/org context, create work items, request approval, receive responses, and record outcomes. |
| A2A messages | `agent_messages`, `sendAgentMessage`, `delegateTask`, `respondToTask` | Known-agent validation, company scope, parent threading, status transitions, approval risk mapping, activity emission, Julius outcome recording, and skill learning are implemented. |
| Work queue | `agent_work_queue`, `createWorkItem`, `setWorkItemStatus` | Work items are advisory by default, company-scoped, skill/context enriched, auditable, and can learn skills on completion. |
| Approval path | `approvals`, `approval_payloads`, `execution-resumption.ts`, `connector-runtime.ts` | Approval/destructive actions pause for Founder approval; rejection records blocked execution; approval resumes exact saved payloads. |
| Execution path | Connector runtime, Mason runtime, Social publishing adapters | Real implemented handlers execute; missing handlers return blockers. Unsupported actions are not silently successful. |
| Julius read/write | `src/lib/julius/wiring.ts` | Agents recall and write company-scoped memory according to registry policy; Atlas is steward; Julius is the brain, not an agent. |
| Company Skills | `src/lib/company-skills/*` | Delegation/work outcomes consult, record, and learn reusable skills via Julius entries. |
| Connector execution | `src/lib/integrations/connector-runtime.ts`, PR #399 readiness | Workforce dependencies now consume truthful connector readiness and provider capability blockers. |
| Activity/audit | `emitActivity`, `agent_actions`, `activity_events`, autonomy audit | Major workforce actions produce activity/audit records where current runtime paths execute. |
| UI/readiness | `/harmony/workforce`, `/harmony/workforce/[agent]` | UI surfaces certification status, Julius access, Founder-only Mason status, tools, dependencies, actionable blockers, and intentional capability boundaries without treating excluded future capabilities as production failures. |

## Canonical Workforce

| Agent | Role | Julius access | Certification |
| --- | --- | --- | --- |
| Harmony | Chief Operating Intelligence | read/write | Operational with approval. Coordinates A2A, work queue, approval routing, Julius, Company Skills, organizational intelligence, and connector runtime. |
| Auditor | Internal Auditor & System Inspector | read/write | Production ready for read-only audits and governance sweep; remediation is queued and approval-gated. |
| Mason | Founder Native Chief Software Engineer | read/write | Operational with approval when GitHub is connected/configured and Vercel token is configured. Founder-only; no direct production edit, unapproved merge, repo deletion, or secret mutation. |
| Catalyst | Content & Growth | read/write | Operational with approval for planning/drafting through Harmony Social. LinkedIn, X, and YouTube publishing remain Founder-approved and provider-readiness dependent. |
| Ambassador | Business Communications & Relations | read/write | Partial/guided runtime. Native web chat and deterministic risk classification exist; framework-only Meta channels remain capability boundaries until their connectors become executable. |
| Atlas | Knowledge Intelligence | steward | Production ready for Julius stewardship, Company Skills curation, and knowledge preservation. |
| Pulse | System Monitoring | read/write | Advisory/partial. Reads available health/audit sources; does not fabricate real-time monitoring. |
| Horizon | Strategy & Planning | read/write | Advisory. Creates evidence-backed plans and delegated work, not external execution. |
| Aegis | Security & Risk | read/write | Advisory/partial. Uses risk classification, readiness, redaction, and audit evidence; no active threat claims beyond telemetry. |
| Ledger | Records & Compliance | read/write | Production ready for records/audit visibility. Not a finance/payment executor. |

## Mason Deep Certification

Mason has real runtime entry points:

- `runMasonProductionRuntime`
- `createMasonProductionAdapters`
- `executeMasonRuntimePlan`
- `determineMasonExecutionReadiness`
- `runConnectorCapability`

Certified behavior:

- Founder-only registry status.
- Current-main/branch/PR workflow is modeled through GitHub connector operations.
- File commits and PR creation require Founder-approved execution scope.
- Merge and destructive repository actions remain blocked.
- Validation request, activity, review queue, Julius memory, and Company Skill updates are executed through Harmony adapters.
- Runtime refuses missing execution evidence.
- Runtime health now requires the specific GitHub capabilities and a real Vercel token configuration; Vercel is no longer healthy from metadata alone.

Remaining live configuration actions:

- GitHub OAuth must be configured and connected with usable token.
- Vercel requires `VERCEL_TOKEN` or `VERCEL_API_TOKEN`.
- Live Mason execution still requires explicit Founder approval.

## Autonomy Matrix

| Agent | Advisory actions | Autonomous reads | Low-risk internal writes | Approval-required external writes | Destructive actions |
| --- | --- | --- | --- | --- | --- |
| Harmony | Planning, routing | Julius/org/skill context | Work item/message creation | Connector writes, publishing, high-risk delegation | Unsupported |
| Auditor | Findings, reports | Audit/config/status reads | Julius audit record, remediation proposal | Remediation execution | Unsupported |
| Mason | Engineering plans | Repo/status reads | Approved branch/commit/PR prep | Code mutation/PR under Founder scope | Blocked |
| Catalyst | Content/campaign plans | Social readiness | Draft prep | External publishing via Harmony Social | Unsupported |
| Ambassador | Response drafts | Conversation/channel context | Low-risk native replies if policy permits | High-risk/customer-impacting replies | Unsupported |
| Atlas | Knowledge curation | Julius/skills retrieval | Julius stewardship writes | Risky knowledge promotion when flagged | Unsupported |
| Pulse | Health summaries | Health/status reads | Alert/work proposal | Remediation | Unsupported |
| Horizon | Strategy/roadmap | Org intelligence | Work proposal | External execution | Unsupported |
| Aegis | Risk/security recommendations | Readiness/audit reads | Risk records | Risk remediation | Unsupported |
| Ledger | Records/compliance notes | Approvals/activity reads | Audit records | None currently | Unsupported |

## Connector and Tool Readiness

Workforce certification evaluates declared connector dependencies against actual provider registration, configuration, connection, and capability availability. Dependencies do not imply execution.

- Mason: GitHub and Vercel are required. Missing GitHub connection/env or Vercel token is shown as configuration required rather than an unsupported capability.
- Catalyst: LinkedIn, X, and YouTube are coordinated through Harmony Social and remain approval-gated.
- Ambassador: Gmail and Slack have partial real read capabilities; WhatsApp, Messenger, and Instagram remain framework-only execution boundaries.
- Pulse: Vercel/Supabase monitoring is truthful and degraded when credentials/handlers are absent.

## Database and Migration Findings

Required workforce tables exist in repository migrations:

- `departments`, `agents`, `work_items`, `approvals`, `activity_events`: `20260601000600_founder_os_foundation.sql`
- `agent_actions`: `20260605000000_agent_actions.sql`
- `julius_entries`: `20260608000000_julius.sql`
- `agent_messages`: `20260624000000_agent_messages.sql`
- `agent_work_queue`: `20260624060000_autonomous_foundations.sql`
- `agent_autonomy_*`: `20260624070000_bounded_autonomy_controls.sql`
- `approval_payloads`, `execution_results`: `20260703000000_autonomy_policy_engine.sql`

Production verification commands:

```bash
supabase migration list --linked
supabase db push --dry-run
```

Verify key migrations in production:

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
where version in (
  '20260601000600',
  '20260605000000',
  '20260608000000',
  '20260624000000',
  '20260624060000',
  '20260624070000',
  '20260703000000',
  '20260712000000',
  '20260712010000'
)
order by version;
```

Do not apply production migrations from an unverified environment. Preserve the social migration checks for:

- `20260712000000_social_publishing_jobs.sql`
- `20260712010000_youtube_production_publishing.sql`

## Security Confirmation

- No API keys, OAuth tokens, refresh tokens, service-role keys, connection strings, or raw provider responses are returned by workforce certification.
- A2A rejects unknown agents and therefore rejects AirBid-reserved names.
- Julius write access follows the registry policy.
- Mason remains Founder-only and PR/preview/approval bounded.
- Connector execution remains policy-gated and audited.

## Rollback

Revert the workforce certification commit to return Workforce UI and Mason health to the prior behavior. No database migration is added by this certification milestone.

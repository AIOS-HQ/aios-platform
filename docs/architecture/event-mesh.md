# AIOS Event Mesh Architecture and Runbook

Baseline: PR #401 merge commit `57c8907d1c57b2e35c4b23a807f3fd3af6a6c48f`.

The AIOS Event Mesh is a provider-neutral transport and worker-delivery layer beneath the certified workforce collaboration system. It does not replace A2A messages, `agent_work_queue`, approvals, Julius, Company Skills, connector runtime, Mason runtime, Social publishing, or audit records.

## Source of Truth

PostgreSQL/Supabase remains authoritative:

- `event_mesh_outbox`: immutable versioned AIOS event envelope ledger.
- `event_mesh_deliveries`: per-consumer delivery state, leases, retries, and acknowledgements.
- `event_mesh_delivery_attempts`: durable attempt history.
- `event_mesh_dead_letters`: safe operational failure records.
- `event_mesh_consumer_checkpoints`: worker heartbeat/checkpoint visibility.

NATS JetStream is a replaceable real-time transport. If NATS is selected, publication still persists the PostgreSQL outbox before JetStream publication.

## Provider Selection

```bash
AIOS_EVENT_MESH_PROVIDER=postgres
AIOS_EVENT_MESH_PROVIDER=nats
AIOS_EVENT_MESH_PROVIDER=local
```

`local` is denied in production unless `AIOS_EVENT_MESH_ALLOW_LOCAL=true` is explicitly set. Workforce execution remains in shadow mode unless `AIOS_EVENT_MESH_WORKFORCE_EXECUTION=true`.

## Event Contract

Code lives in `src/lib/event-mesh`.

- `types.ts`: provider-neutral contracts.
- `envelope.ts`: versioned AIOS event envelope, runtime validation, size limits, secret-key rejection, deterministic idempotency.
- `adapters/postgres.ts`: durable polling/lease adapter.
- `adapters/nats.ts`: NATS JetStream adapter with isolated NATS imports.
- `adapters/local.ts`: deterministic test adapter.
- `worker.ts`: portable long-running Node worker runtime.
- `workforce-handlers.ts`: bounded workforce dispatch handlers.

Initial event types include workforce task/message/response, connector execution, approvals, skills, Julius memory, system health, and social publishing lifecycle events. Unsupported capabilities must not emit success events.


### Canonical Workforce Envelope (Milestone 5)

Milestone 5 extends the existing Event Mesh + A2A compatibility path with a canonical workforce message envelope embedded in `agent_messages.context.envelope`.

- Contract owner: `src/lib/harmony/agents/a2a.ts`
- Transport: existing Event Mesh (`src/lib/event-mesh/*`)
- Compatibility: existing `agent_messages` status and approval flow remain authoritative

Envelope fields cover:

- lifecycle (`created`, `delegated`, `awaiting_approval`, `acknowledged`, `in_progress`, `completed`, `blocked`, `timed_out`, `dead_lettered`)
- correlation and causation (`correlationId`, `causationId`, `parentMessageId`)
- policy and approvals (`risk`, `requiresApproval`, `approvalRequired`, `approvalId`)
- delivery semantics (`ackRequested`, `ackReceived`, `retryEligible`, timeout/dead-letter reasons)
- company execution scope (`companyId`, `userId`, `companyScopeEnforced`)

This is additive and backward-compatible: existing Harmony actions, A2A/delegation, Event Mesh handlers, approvals, review queue, and ledger evidence continue to operate without a parallel bus.

## Worker Runtime

Run locally or on a long-running host:

```bash
npm run worker:event-mesh
```

The worker supports graceful shutdown, consumer registration, handler timeout, lease-based Postgres delivery, retry/dead-letter handling, and safe health checks.

## Docker Local Setup

Start NATS JetStream with persistent storage and a worker:

```bash
docker compose -f docker-compose.event-mesh.yml up
```

The compose file uses a persistent `aios-nats-jetstream` volume. The worker still needs Supabase env vars and service-role access through `.env.local`.

## Portability

The same worker process can run on local Docker, a standard Linux VM, Google Compute Engine, GKE, Azure VM/Container Apps/Kubernetes, AWS EC2/ECS/EKS, Replit Reserved VM, or self-hosted infrastructure.

Replit is suitable only when the target provides always-on processes, persistent storage, inbound/outbound networking, environment secrets, and process restart support. Request-driven/serverless-only environments are not appropriate for the NATS core worker because JetStream delivery requires durable long-running consumers.

Future adapters can implement the same Event Mesh contract for Azure Service Bus, Google Pub/Sub, RabbitMQ, or Redis Streams without changing Harmony, Mason, Julius, or specialist business logic.

## Rollout

1. Shadow/outbox emission: `AIOS_EVENT_MESH_OUTBOX_ENABLED=true`, `AIOS_EVENT_MESH_WORKFORCE_EXECUTION=false`.
2. Run Postgres worker for low-risk internal task delivery.
3. Enable approval-resolution event handling after production migration verification.
4. Enable safe connector dispatch only after connector idempotency checks.
5. Enable Mason approved engineering work only after Founder-approved GitHub/Vercel readiness.
6. Expand specialist workloads by adding explicit handlers.

Synchronous compatibility remains intact. Do not enable async execution for a path that still performs the same mutation synchronously unless the handler is idempotent and guarded by business-state claims.

## Dead Letter and Replay

Dead letters store safe metadata only. Destructive events are not replayable. Replay uses PostgreSQL outbox state and recreates a delivery for an eligible consumer; it does not mutate the original business record by itself.

The Harmony Operations page surfaces provider health, pending deliveries, retries, dead letters, oldest pending event, and worker heartbeat count.

## Security

- Event envelopes reject secret-shaped keys in payload/context.
- Event payloads are capped at 64 KiB.
- Event tables are owner-private through RLS for user-visible reads.
- Service workers use service-role access only for claim/ack/replay RPCs.
- NATS credentials are configured only through environment variables.
- No OAuth tokens, API keys, refresh tokens, service-role keys, signed URLs, or raw provider responses belong in event payloads.

## Migration Verification

Do not apply production migrations from an unverified environment.

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
```

Post-apply SQL:

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
where version in (
  '20260601000600',
  '20260624000000',
  '20260624060000',
  '20260703000000',
  '20260712000000',
  '20260712010000',
  '20260713000000'
)
order by version;

select public.event_mesh_health();
```

## Backup and Restore

Back up PostgreSQL as the authoritative event history. JetStream state is operational acceleration and can be rebuilt by replaying eligible Postgres outbox deliveries. For NATS, back up the JetStream storage volume if low-latency redelivery state is important during an incident.

## Rollback

Set:

```bash
AIOS_EVENT_MESH_OUTBOX_ENABLED=false
AIOS_EVENT_MESH_WORKFORCE_EXECUTION=false
```

Stop workers. Existing synchronous A2A, approvals, Julius, Company Skills, connector runtime, Social publishing, and Mason behavior continue to operate. Keep Event Mesh tables for audit/recovery; no destructive rollback is required.

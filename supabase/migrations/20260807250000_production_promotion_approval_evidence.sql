create table if not exists public.production_promotion_requests (
  id uuid primary key default gen_random_uuid(),
  promotion_request_id text not null unique,
  repository text not null,
  purpose text not null,
  target_sha text not null,
  source_environment text not null,
  target_environment text not null,
  runtime_evidence_id text not null,
  runtime_artifact_id text not null,
  migration_evidence_id text not null,
  migration_artifact_id text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint production_promotion_requests_repository_check
    check (repository = 'AIOS-HQ/aios-platform'),
  constraint production_promotion_requests_purpose_check
    check (purpose = 'production_promotion'),
  constraint production_promotion_requests_target_sha_check
    check (target_sha ~ '^[0-9a-f]{40}$'),
  constraint production_promotion_requests_source_environment_check
    check (source_environment = 'staging'),
  constraint production_promotion_requests_target_environment_check
    check (target_environment = 'production'),
  constraint production_promotion_requests_runtime_evidence_id_check
    check (
      btrim(runtime_evidence_id) <> ''
      and lower(runtime_evidence_id) not like '%latest%'
      and lower(runtime_evidence_id) not like '%head%'
      and lower(runtime_evidence_id) <> 'main'
    ),
  constraint production_promotion_requests_runtime_artifact_id_check
    check (
      btrim(runtime_artifact_id) <> ''
      and lower(runtime_artifact_id) not like '%latest%'
      and lower(runtime_artifact_id) not like '%head%'
      and lower(runtime_artifact_id) <> 'main'
    ),
  constraint production_promotion_requests_migration_evidence_id_check
    check (
      btrim(migration_evidence_id) <> ''
      and lower(migration_evidence_id) not like '%latest%'
      and lower(migration_evidence_id) not like '%head%'
      and lower(migration_evidence_id) <> 'main'
    ),
  constraint production_promotion_requests_migration_artifact_id_check
    check (
      btrim(migration_artifact_id) <> ''
      and lower(migration_artifact_id) not like '%latest%'
      and lower(migration_artifact_id) not like '%head%'
      and lower(migration_artifact_id) <> 'main'
    )
);

create table if not exists public.production_promotion_decisions (
  id uuid primary key default gen_random_uuid(),
  promotion_request_id text not null references public.production_promotion_requests(promotion_request_id) on delete restrict,
  decision_source text not null,
  decision text not null,
  actor_type text,
  actor_id text,
  agent_id text,
  policy_version text,
  evidence_id text not null unique,
  decided_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint production_promotion_decisions_source_check
    check (decision_source in ('founder', 'harmony')),
  constraint production_promotion_decisions_decision_check
    check (decision in ('approved', 'rejected')),
  constraint production_promotion_decisions_founder_fields_check
    check (
      decision_source <> 'founder'
      or (
        actor_type = 'founder'
        and actor_id is not null
        and btrim(actor_id) <> ''
      )
    ),
  constraint production_promotion_decisions_harmony_fields_check
    check (
      decision_source <> 'harmony'
      or (
        agent_id = 'harmony'
        and policy_version is not null
        and btrim(policy_version) <> ''
      )
    ),
  constraint production_promotion_decisions_evidence_id_check
    check (
      btrim(evidence_id) <> ''
      and lower(evidence_id) not like '%latest%'
      and lower(evidence_id) not like '%head%'
      and lower(evidence_id) <> 'main'
    )
);

create unique index if not exists production_promotion_decisions_request_source_uq
  on public.production_promotion_decisions (promotion_request_id, decision_source);

alter table public.production_promotion_requests enable row level security;
alter table public.production_promotion_decisions enable row level security;

grant select on public.production_promotion_requests to authenticated, service_role;
grant select on public.production_promotion_decisions to authenticated, service_role;

revoke insert, update, delete on public.production_promotion_requests from authenticated;
revoke insert, update, delete on public.production_promotion_decisions from authenticated;
revoke all on public.production_promotion_requests from anon;
revoke all on public.production_promotion_decisions from anon;

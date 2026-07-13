-- ============================================================================
-- AIOS Event Mesh — durable provider-neutral outbox/inbox.
--
-- PostgreSQL remains the source of truth. Transports such as NATS can accelerate
-- delivery, but every event and delivery result is recoverable from these tables.
-- Additive + idempotent. No existing workforce/social tables are modified.
-- ============================================================================

do $$ begin
  create type public.event_mesh_delivery_status as enum (
    'pending',
    'leased',
    'acked',
    'retry',
    'dead_letter',
    'archived'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.event_mesh_outbox (
  event_id uuid primary key,
  event_type text not null,
  event_version int not null default 1,
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  source_agent text,
  target_agent text,
  reference_type text,
  reference_id text,
  objective_id text,
  approval_id text,
  risk text not null default 'routine' check (risk in ('routine', 'approval', 'destructive')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  trace_id text not null,
  correlation_id text not null,
  causation_id text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null,
  published_at timestamptz not null,
  scheduled_for timestamptz,
  content_type text not null default 'application/vnd.aios.event+json',
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  attachment_refs jsonb not null default '[]'::jsonb,
  envelope jsonb not null,
  status text not null default 'published' check (status in ('published', 'scheduled', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists event_mesh_outbox_company_idx
  on public.event_mesh_outbox(company_id, created_at desc);
create index if not exists event_mesh_outbox_type_idx
  on public.event_mesh_outbox(event_type, created_at desc);
create index if not exists event_mesh_outbox_pending_idx
  on public.event_mesh_outbox(status, scheduled_for, created_at);

create table if not exists public.event_mesh_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_mesh_outbox(event_id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  consumer_name text not null,
  status public.event_mesh_delivery_status not null default 'pending',
  attempt int not null default 0,
  max_attempts int not null default 5,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  locked_by text,
  last_error text,
  acked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, consumer_name)
);

create index if not exists event_mesh_deliveries_claim_idx
  on public.event_mesh_deliveries(consumer_name, status, available_at, lease_expires_at);
create index if not exists event_mesh_deliveries_company_idx
  on public.event_mesh_deliveries(company_id, status, created_at desc);

drop trigger if exists set_event_mesh_deliveries_updated_at on public.event_mesh_deliveries;
create trigger set_event_mesh_deliveries_updated_at
  before update on public.event_mesh_deliveries
  for each row execute function public.set_updated_at();

create table if not exists public.event_mesh_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.event_mesh_deliveries(id) on delete cascade,
  event_id uuid not null references public.event_mesh_outbox(event_id) on delete cascade,
  consumer_name text not null,
  worker_id text,
  attempt int not null,
  status text not null check (status in ('claimed', 'acked', 'retry', 'dead_letter', 'failed')),
  reason text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists event_mesh_attempts_delivery_idx
  on public.event_mesh_delivery_attempts(delivery_id, created_at desc);

create table if not exists public.event_mesh_dead_letters (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.event_mesh_deliveries(id) on delete set null,
  event_id uuid not null references public.event_mesh_outbox(event_id) on delete cascade,
  event_type text not null,
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  consumer_name text not null,
  reason text not null,
  attempts int not null default 0,
  safe_metadata jsonb not null default '{}'::jsonb,
  replayable boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_mesh_dead_letters_company_idx
  on public.event_mesh_dead_letters(company_id, created_at desc);
create index if not exists event_mesh_dead_letters_event_idx
  on public.event_mesh_dead_letters(event_id, consumer_name);

create table if not exists public.event_mesh_consumer_checkpoints (
  consumer_name text primary key,
  worker_id text,
  last_event_id uuid,
  last_delivery_id uuid,
  heartbeat_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_event_mesh_consumer_checkpoints_updated_at on public.event_mesh_consumer_checkpoints;
create trigger set_event_mesh_consumer_checkpoints_updated_at
  before update on public.event_mesh_consumer_checkpoints
  for each row execute function public.set_updated_at();

alter table public.event_mesh_outbox enable row level security;
alter table public.event_mesh_deliveries enable row level security;
alter table public.event_mesh_delivery_attempts enable row level security;
alter table public.event_mesh_dead_letters enable row level security;
alter table public.event_mesh_consumer_checkpoints enable row level security;

drop policy if exists "owner_select" on public.event_mesh_outbox;
create policy "owner_select" on public.event_mesh_outbox
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.event_mesh_outbox;
create policy "owner_insert" on public.event_mesh_outbox
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_select" on public.event_mesh_deliveries;
create policy "owner_select" on public.event_mesh_deliveries
  for select using (auth.uid() = user_id);

drop policy if exists "owner_select" on public.event_mesh_delivery_attempts;
create policy "owner_select" on public.event_mesh_delivery_attempts
  for select using (
    exists (
      select 1 from public.event_mesh_deliveries d
      where d.id = delivery_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "owner_select" on public.event_mesh_dead_letters;
create policy "owner_select" on public.event_mesh_dead_letters
  for select using (auth.uid() = user_id);

drop policy if exists "admin_checkpoint_none" on public.event_mesh_consumer_checkpoints;
create policy "admin_checkpoint_none" on public.event_mesh_consumer_checkpoints
  for select using (false);

grant select on table public.event_mesh_outbox to authenticated;
grant select on table public.event_mesh_deliveries to authenticated;
grant select on table public.event_mesh_delivery_attempts to authenticated;
grant select on table public.event_mesh_dead_letters to authenticated;

create or replace function public.publish_event_mesh_event(p_event jsonb, p_consumer text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := (p_event->>'eventId')::uuid;
  v_consumer text := coalesce(nullif(p_consumer, ''), 'aios-workforce-dispatcher');
  v_duplicate boolean := false;
  v_scheduled boolean := (p_event->>'scheduledFor') is not null;
begin
  insert into public.event_mesh_outbox (
    event_id, event_type, event_version, user_id, company_id, source_agent, target_agent,
    reference_type, reference_id, objective_id, approval_id, risk, priority, trace_id,
    correlation_id, causation_id, idempotency_key, occurred_at, published_at, scheduled_for,
    content_type, payload, context, attachment_refs, envelope, status
  )
  values (
    v_event_id,
    p_event->>'eventType',
    coalesce((p_event->>'eventVersion')::int, 1),
    nullif(p_event->>'userId', '')::uuid,
    nullif(p_event->>'companyId', '')::uuid,
    p_event->>'sourceAgent',
    p_event->>'targetAgent',
    p_event#>>'{taskRef,type}',
    p_event#>>'{taskRef,id}',
    p_event->>'objectiveId',
    p_event->>'approvalId',
    coalesce(p_event->>'risk', 'routine'),
    coalesce(p_event->>'priority', 'normal'),
    p_event->>'traceId',
    p_event->>'correlationId',
    p_event->>'causationId',
    p_event->>'idempotencyKey',
    (p_event->>'occurredAt')::timestamptz,
    (p_event->>'publishedAt')::timestamptz,
    nullif(p_event->>'scheduledFor', '')::timestamptz,
    coalesce(p_event->>'contentType', 'application/vnd.aios.event+json'),
    coalesce(p_event->'payload', '{}'::jsonb),
    coalesce(p_event->'context', '{}'::jsonb),
    coalesce(p_event->'attachmentRefs', '[]'::jsonb),
    p_event,
    case when v_scheduled then 'scheduled' else 'published' end
  )
  on conflict (idempotency_key) do nothing;

  if not found then
    v_duplicate := true;
    select event_id into v_event_id
    from public.event_mesh_outbox
    where idempotency_key = p_event->>'idempotencyKey';
  end if;

  insert into public.event_mesh_deliveries (
    event_id, user_id, company_id, consumer_name, max_attempts, available_at
  )
  select
    event_id,
    user_id,
    company_id,
    v_consumer,
    coalesce((envelope->>'maximumAttempts')::int, 5),
    coalesce((envelope->>'scheduledFor')::timestamptz, now())
  from public.event_mesh_outbox
  where event_id = v_event_id
  on conflict (event_id, consumer_name) do nothing;

  return jsonb_build_object('eventId', v_event_id, 'duplicate', v_duplicate, 'scheduled', v_scheduled);
end;
$$;

create or replace function public.claim_event_mesh_deliveries(
  p_consumer text,
  p_worker text,
  p_event_types text[],
  p_limit int default 10,
  p_lease_seconds int default 60
)
returns table(delivery_id uuid, consumer_name text, attempt int, lease_expires_at timestamptz, event jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select d.id
    from public.event_mesh_deliveries d
    join public.event_mesh_outbox o on o.event_id = d.event_id
    where d.consumer_name = p_consumer
      and o.event_type = any(p_event_types)
      and d.status in ('pending', 'retry', 'leased')
      and d.available_at <= now()
      and (d.lease_expires_at is null or d.lease_expires_at < now())
      and d.attempt < d.max_attempts
    order by
      case o.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      d.available_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  ),
  updated as (
    update public.event_mesh_deliveries d
    set status = 'leased',
        locked_by = p_worker,
        attempt = d.attempt + 1,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    from claimable c
    where d.id = c.id
    returning d.*
  ),
  attempts as (
    insert into public.event_mesh_delivery_attempts(delivery_id, event_id, consumer_name, worker_id, attempt, status)
    select id, event_id, consumer_name, p_worker, attempt, 'claimed'
    from updated
    returning delivery_id
  )
  select u.id, u.consumer_name, u.attempt, u.lease_expires_at, o.envelope
  from updated u
  join public.event_mesh_outbox o on o.event_id = u.event_id;

  insert into public.event_mesh_consumer_checkpoints(consumer_name, worker_id, heartbeat_at)
  values (p_consumer, p_worker, now())
  on conflict (consumer_name) do update
    set worker_id = excluded.worker_id, heartbeat_at = excluded.heartbeat_at;
end;
$$;

create or replace function public.ack_event_mesh_delivery(p_delivery_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_event_id uuid;
declare v_consumer text;
declare v_attempt int;
begin
  update public.event_mesh_deliveries
  set status = 'acked', acked_at = now(), locked_by = p_worker, lease_expires_at = null
  where id = p_delivery_id and status = 'leased'
  returning event_id, consumer_name, attempt into v_event_id, v_consumer, v_attempt;
  if not found then return false; end if;
  insert into public.event_mesh_delivery_attempts(delivery_id, event_id, consumer_name, worker_id, attempt, status)
  values (p_delivery_id, v_event_id, v_consumer, p_worker, v_attempt, 'acked');
  update public.event_mesh_consumer_checkpoints
  set last_event_id = v_event_id, last_delivery_id = p_delivery_id, heartbeat_at = now(), worker_id = p_worker
  where consumer_name = v_consumer;
  return true;
end;
$$;

create or replace function public.dead_letter_event_mesh_delivery(
  p_delivery_id uuid,
  p_worker text,
  p_reason text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare d record;
declare o record;
begin
  select * into d from public.event_mesh_deliveries where id = p_delivery_id for update;
  if not found then return false; end if;
  select * into o from public.event_mesh_outbox where event_id = d.event_id;

  update public.event_mesh_deliveries
  set status = 'dead_letter', last_error = p_reason, locked_by = p_worker, lease_expires_at = null
  where id = p_delivery_id;

  insert into public.event_mesh_delivery_attempts(delivery_id, event_id, consumer_name, worker_id, attempt, status, reason, safe_metadata)
  values (p_delivery_id, d.event_id, d.consumer_name, p_worker, d.attempt, 'dead_letter', p_reason, p_safe_metadata);

  insert into public.event_mesh_dead_letters(delivery_id, event_id, event_type, user_id, company_id, consumer_name, reason, attempts, safe_metadata, replayable)
  values (p_delivery_id, d.event_id, o.event_type, d.user_id, d.company_id, d.consumer_name, p_reason, d.attempt, p_safe_metadata, o.risk <> 'destructive')
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.nack_event_mesh_delivery(
  p_delivery_id uuid,
  p_worker text,
  p_reason text,
  p_retry boolean default true,
  p_delay_ms int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d record;
declare v_delay interval;
begin
  select * into d from public.event_mesh_deliveries where id = p_delivery_id for update;
  if not found then return jsonb_build_object('action', 'nack', 'ok', false); end if;

  if (not p_retry) or d.attempt >= d.max_attempts then
    perform public.dead_letter_event_mesh_delivery(p_delivery_id, p_worker, p_reason, '{}'::jsonb);
    return jsonb_build_object('action', 'dead_letter', 'ok', true);
  end if;

  v_delay := make_interval(secs => greatest(coalesce(p_delay_ms, 1000), 0) / 1000);
  update public.event_mesh_deliveries
  set status = 'retry',
      last_error = p_reason,
      available_at = now() + v_delay,
      lease_expires_at = null,
      locked_by = null
  where id = p_delivery_id;
  insert into public.event_mesh_delivery_attempts(delivery_id, event_id, consumer_name, worker_id, attempt, status, reason)
  values (p_delivery_id, d.event_id, d.consumer_name, p_worker, d.attempt, 'retry', p_reason);
  return jsonb_build_object('action', 'retry', 'ok', true);
end;
$$;

create or replace function public.replay_event_mesh_event(
  p_event_id uuid,
  p_consumer text default null,
  p_reason text default 'manual_replay'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o record;
declare v_consumer text;
begin
  select * into o from public.event_mesh_outbox where event_id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
  if o.risk = 'destructive' then raise exception 'destructive_replay_blocked'; end if;
  v_consumer := coalesce(nullif(p_consumer, ''), 'aios-workforce-dispatcher');
  insert into public.event_mesh_deliveries(event_id, user_id, company_id, consumer_name, max_attempts, available_at, last_error)
  values (p_event_id, o.user_id, o.company_id, v_consumer, coalesce((o.envelope->>'maximumAttempts')::int, 5), now(), p_reason)
  on conflict (event_id, consumer_name) do update
    set status = 'pending', available_at = now(), lease_expires_at = null, locked_by = null, last_error = p_reason;
  update public.event_mesh_dead_letters
  set archived_at = now()
  where event_id = p_event_id and consumer_name = v_consumer and archived_at is null;
  return jsonb_build_object('event_id', p_event_id, 'idempotency_key', o.idempotency_key);
end;
$$;

create or replace function public.event_mesh_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'leased', count(*) filter (where status = 'leased'),
    'retries', count(*) filter (where status = 'retry'),
    'deadLetters', count(*) filter (where status = 'dead_letter'),
    'oldestPendingAt', min(available_at) filter (where status in ('pending', 'retry')),
    'workerCount', (select count(*) from public.event_mesh_consumer_checkpoints where heartbeat_at > now() - interval '5 minutes')
  )
  from public.event_mesh_deliveries;
$$;

grant execute on function public.publish_event_mesh_event(jsonb, text) to authenticated, service_role;
grant execute on function public.claim_event_mesh_deliveries(text, text, text[], int, int) to service_role;
grant execute on function public.ack_event_mesh_delivery(uuid, text) to service_role;
grant execute on function public.nack_event_mesh_delivery(uuid, text, text, boolean, int) to service_role;
grant execute on function public.dead_letter_event_mesh_delivery(uuid, text, text, jsonb) to service_role;
grant execute on function public.replay_event_mesh_event(uuid, text, text) to service_role;
grant execute on function public.event_mesh_health() to authenticated, service_role;

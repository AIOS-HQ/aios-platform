-- AIOS Integration Center — WhatsApp Business Cloud API foundation.
-- Stores safe webhook metadata for dedupe/audit and outbound idempotency records.
-- Message body content remains in owner-scoped `messages`; webhook event payloads
-- here must contain safe diagnostics only.

create table if not exists public.whatsapp_webhook_events (
  event_id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  phone_number_id text,
  event_type text not null,
  provider_message_id text,
  contact_hash text,
  safe_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_user_idx
  on public.whatsapp_webhook_events(user_id, processed_at desc);
create index if not exists whatsapp_webhook_events_provider_message_idx
  on public.whatsapp_webhook_events(provider_message_id);
create index if not exists whatsapp_webhook_events_phone_idx
  on public.whatsapp_webhook_events(phone_number_id, processed_at desc);

create table if not exists public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  provider_message_id text,
  idempotency_key text not null unique,
  content_hash text not null,
  message_type text not null check (message_type in ('text','template','image','document','audio','video')),
  status public.message_status not null default 'queued',
  approval_id uuid references public.approvals(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_outbound_user_idx
  on public.whatsapp_outbound_messages(user_id, created_at desc);
create index if not exists whatsapp_outbound_provider_message_idx
  on public.whatsapp_outbound_messages(provider_message_id);

drop trigger if exists set_whatsapp_outbound_messages_updated_at on public.whatsapp_outbound_messages;
create trigger set_whatsapp_outbound_messages_updated_at
  before update on public.whatsapp_outbound_messages
  for each row execute function public.set_updated_at();

alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_outbound_messages enable row level security;

drop policy if exists "whatsapp_webhook_events_owner_select" on public.whatsapp_webhook_events;
create policy "whatsapp_webhook_events_owner_select" on public.whatsapp_webhook_events
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "whatsapp_outbound_messages_owner_select" on public.whatsapp_outbound_messages;
create policy "whatsapp_outbound_messages_owner_select" on public.whatsapp_outbound_messages
  for select using (auth.uid() = user_id or public.is_admin());

-- Runtime writes happen through service-role webhook/capability handlers.
grant select on table public.whatsapp_webhook_events to authenticated;
grant select on table public.whatsapp_outbound_messages to authenticated;

-- ============================================================================
-- Founder OS — Communications layer (channels, conversations, messages).
-- Additive + idempotent. Owner-scoped + RLS, mirroring the OS tables. No secrets
-- are stored here — `credential_ref` is a key NAME only; secrets live in env.
-- ============================================================================

do $$ begin create type public.channel_kind as enum ('whatsapp','email','sms','telegram','facebook','instagram','linkedin','x','web_chat'); exception when duplicate_object then null; end $$;
do $$ begin create type public.channel_status as enum ('disconnected','connected','error'); exception when duplicate_object then null; end $$;
do $$ begin create type public.conversation_status as enum ('open','pending','snoozed','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.message_direction as enum ('inbound','outbound'); exception when duplicate_object then null; end $$;
do $$ begin create type public.message_status as enum ('received','queued','awaiting_approval','sent','delivered','read','failed'); exception when duplicate_object then null; end $$;

-- --- channels (a connected comms account / endpoint) ------------------------
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  kind public.channel_kind not null,
  name text not null,
  handle text,
  status public.channel_status not null default 'disconnected',
  credential_ref text,
  autonomy_level int check (autonomy_level between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists channels_user_idx on public.channels(user_id);
create index if not exists channels_company_idx on public.channels(company_id);

-- --- conversations (a thread with a contact on a channel) -------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  contact text not null,
  subject text,
  status public.conversation_status not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations(user_id, status);
create index if not exists conversations_channel_idx on public.conversations(channel_id);
create index if not exists conversations_recent_idx on public.conversations(user_id, last_message_at desc);

-- --- messages (append-only within a conversation) --------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text not null,
  status public.message_status not null default 'queued',
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists messages_user_idx on public.messages(user_id);

-- --- updated_at triggers (channels + conversations) ------------------------
do $$
declare t text;
begin
  foreach t in array array['channels','conversations']
  loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s;', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- --- Row Level Security — owner-scoped --------------------------------------
do $$
declare t text;
begin
  foreach t in array array['channels','conversations','messages']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "owner_select" on public.%I;', t);
    execute format('create policy "owner_select" on public.%I for select using (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_insert" on public.%I;', t);
    execute format('create policy "owner_insert" on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_update" on public.%I;', t);
    execute format('create policy "owner_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_delete" on public.%I;', t);
    execute format('create policy "owner_delete" on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

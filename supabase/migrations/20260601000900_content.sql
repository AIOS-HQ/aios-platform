-- ============================================================================
-- Founder OS — Content layer (calendar + analytics).
-- Additive + idempotent. Owner-scoped + RLS, mirroring the OS tables.
-- `content_items` are calendar entries / pieces; analytics are snapshot counters
-- on the row (manual now, social-API populated later). The Content *department*
-- + helpers need no schema (departments.key is text) — only this calendar +
-- analytics persistence is new.
-- ============================================================================

do $$ begin create type public.content_format as enum ('youtube_video','youtube_short','tiktok','instagram_reel','instagram_post','blog_post','thumbnail'); exception when duplicate_object then null; end $$;
do $$ begin create type public.content_item_status as enum ('idea','planned','scripted','scheduled','published','archived'); exception when duplicate_object then null; end $$;

-- --- content_items (calendar entry / content piece) ------------------------
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  work_item_id uuid references public.work_items(id) on delete set null,
  title text not null,
  format public.content_format not null,
  status public.content_item_status not null default 'idea',
  channel text,
  notes text,
  scheduled_for date,
  published_at date,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  impressions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_user_idx on public.content_items(user_id, status);
create index if not exists content_items_company_idx on public.content_items(company_id);
create index if not exists content_items_schedule_idx on public.content_items(user_id, scheduled_for);

-- --- updated_at trigger -----------------------------------------------------
do $$
begin
  execute 'drop trigger if exists set_content_items_updated_at on public.content_items;';
  execute 'create trigger set_content_items_updated_at before update on public.content_items for each row execute function public.set_updated_at();';
end $$;

-- --- Row Level Security — owner-scoped --------------------------------------
do $$
begin
  execute 'alter table public.content_items enable row level security;';
  execute 'drop policy if exists "owner_select" on public.content_items;';
  execute 'create policy "owner_select" on public.content_items for select using (auth.uid() = user_id);';
  execute 'drop policy if exists "owner_insert" on public.content_items;';
  execute 'create policy "owner_insert" on public.content_items for insert with check (auth.uid() = user_id);';
  execute 'drop policy if exists "owner_update" on public.content_items;';
  execute 'create policy "owner_update" on public.content_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);';
  execute 'drop policy if exists "owner_delete" on public.content_items;';
  execute 'create policy "owner_delete" on public.content_items for delete using (auth.uid() = user_id);';
end $$;

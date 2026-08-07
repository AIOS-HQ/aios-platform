-- Marketplace Production M1 moderation evidence fields
alter table public.marketplace_items
  add column if not exists moderation_decision text,
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_policy_decision jsonb;

create index if not exists marketplace_items_moderated_at_idx
  on public.marketplace_items(moderated_at desc);

create index if not exists marketplace_items_moderation_decision_idx
  on public.marketplace_items(moderation_decision);

alter table public.marketplace_items drop constraint if exists marketplace_items_moderation_decision_check;
alter table public.marketplace_items
  add constraint marketplace_items_moderation_decision_check
  check (moderation_decision is null or moderation_decision in ('approve','reject'));

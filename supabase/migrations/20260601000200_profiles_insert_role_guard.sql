-- ============================================================================
-- AIOS Core — 0003: harden profiles INSERT against role escalation (S-1)
--
-- The original INSERT policy only checked `auth.uid() = id`, which would let a
-- client self-insert a row with role = 'admin' (admin can read all profiles via
-- is_admin()). It was mitigated in practice (the signup trigger pre-creates the
-- row → PK conflict, and there is no DELETE policy), but this closes the gap as
-- defense-in-depth on BOTH the policy and a trigger.
-- ============================================================================

-- 1) Tighten the RLS INSERT policy: a user may only self-insert as personal_user.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'personal_user');

-- 2) Defense-in-depth: force role to 'personal_user' on any non-admin insert,
--    regardless of how the row is inserted. The signup trigger (SECURITY DEFINER)
--    already inserts the default role, so this is a no-op for normal signups.
create or replace function public.enforce_profile_insert_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := 'personal_user';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_insert_role on public.profiles;
create trigger guard_profile_insert_role
  before insert on public.profiles
  for each row execute function public.enforce_profile_insert_role();

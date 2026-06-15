-- Expand Founder Harmony autonomy levels from 0–3 to 0–4.
-- Required because application code supports Executive Autonomous level 4.

alter table public.departments
  drop constraint if exists departments_autonomy_level_check;

alter table public.departments
  add constraint departments_autonomy_level_check
  check (autonomy_level between 0 and 4);

alter table public.agents
  drop constraint if exists agents_autonomy_level_check;

alter table public.agents
  add constraint agents_autonomy_level_check
  check (autonomy_level between 0 and 4);

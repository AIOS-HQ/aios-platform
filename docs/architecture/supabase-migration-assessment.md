# Supabase Migration Assessment

Founder requested a per-migration assessment **before** applying the four pending
migrations. Below: purpose, dependencies, risks, and recommended action for each.
All four are **additive, idempotent, owner-scoped (RLS `auth.uid() = user_id`),
and non-destructive** — none alter or drop existing tables/columns/data. The
Julius migration is approved to proceed and is included for completeness.

> Status: **the four migrations are NOT yet applied** (per founder hold). Until
> applied, the dependent features degrade gracefully (empty states / no-ops) —
> no crashes.

## Shared prerequisite

All five migrations use the shared trigger function `public.set_updated_at()`
(created by an earlier base migration) and `gen_random_uuid()` / `auth.users`.
Verify the function exists before applying:
```sql
select to_regprocedure('public.set_updated_at()');  -- must be non-null
```

---

## 1. `20260604000000_memories.sql`

- **Purpose:** Harmony Memory/RAG store (`memories`) — per-user memories with kind,
  importance, source. Backs `/settings/memory`, the learning summary, and future
  assistant retrieval.
- **Dependencies:** `set_updated_at()`, `auth.users`. No dependency on other
  pending migrations.
- **Risks:** None material. New table + enum + owner RLS. No existing object touched.
- **Recommended action:** **Apply.** Foundational; several shipped features read it.

## 2. `20260605000000_agent_actions.sql`

- **Purpose:** Function-calling / tool-execution **audit + approval** log
  (`agent_actions`). Backs the Approval Center, connector audit, the learning
  approval queue, and the **new Auditor agent**.
- **Dependencies:** `set_updated_at()`, `auth.users`. Independent of the others.
- **Risks:** None material. New table + enum + owner RLS.
- **Recommended action:** **Apply.** The Auditor (this phase) and Approval Center
  are far more useful once this persists.

## 3. `20260606000000_learning_settings.sql`

- **Purpose:** Per-user auto-learning control (`learning_settings`) — the
  enable/disable switch for automatic memory capture.
- **Dependencies:** `set_updated_at()`, `auth.users`. **Must be applied before
  migration #4** (which adds a column to this table).
- **Risks:** None material. New table + owner RLS.
- **Recommended action:** **Apply** (before #4).

## 4. `20260607000000_learning_require_approval.sql`

- **Purpose:** Adds `require_approval boolean not null default false` to
  `learning_settings` — routes auto-captured memories through approval when on.
- **Dependencies:** **Requires `learning_settings` to exist** (migration #3).
  Ordering is enforced by timestamp, but if applying manually, run #3 first.
- **Risks:** Minimal. `add column if not exists ... default false` — additive,
  backfills `false`, no data change. (On very large tables an `ADD COLUMN` with a
  non-volatile default is a metadata-only change in modern Postgres.)
- **Recommended action:** **Apply** immediately after #3.

---

## 5. `20260608000000_julius.sql` (approved to proceed)

- **Purpose:** Julius organizational brain (`julius_entries`) — company-scoped,
  owner-private. Backs Julius wiring.
- **Dependencies:** `set_updated_at()`, `auth.users`, **`public.companies`** (FK).
  Independent of #1–#4.
- **Risks:** None material. New table + enum + owner RLS; company isolation via
  `company_id`.
- **Recommended action:** **Apply** (founder-approved).

---

## Recommended apply order & verification

`supabase db push` applies all unapplied files in timestamp order automatically:
```
20260604000000_memories.sql
20260605000000_agent_actions.sql
20260606000000_learning_settings.sql
20260607000000_learning_require_approval.sql
20260608000000_julius.sql
```
Verify after:
```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('memories','agent_actions','learning_settings','julius_entries')
order by table_name;                                   -- expect 4 rows
select column_name from information_schema.columns
where table_name='learning_settings' and column_name='require_approval';  -- 1 row
```

**Bottom line:** all five are safe to apply; none are destructive; the only
ordering constraint is #3 before #4. Apply when ready.

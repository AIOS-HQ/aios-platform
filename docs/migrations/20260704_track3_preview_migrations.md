# Track 3 — Preview-First Migrations (HELD for Founder approval)

Three additive, behaviour-neutral migrations that provision storage for the Phase 2 / Connector-runtime foundations. **None is wired to a runtime path** — applying them changes no behaviour; they only create tables. Nothing merges or applies without Founder approval.

| Migration | Table | Backs | Wiring status |
|---|---|---|---|
| `20260704000000` | `company_context_envelope` | Foundation 1 — Company Context Envelope | app layer, later PR |
| `20260704000100` | `capability_invocations` | Capability Runtime telemetry sink | `setTelemetrySink`, Group C |
| `20260704000200` | `clarification_requests` | F2 Clarification persistence | `setClarificationStore`, later PR |

All three follow the established conventions: `auth.users(id)` / `public.companies(id)` FKs, `public.set_updated_at()` trigger, `auth.uid() = user_id` RLS, idempotent (`create table if not exists`, `drop policy if exists`).

## Security Review
- **Tenant isolation:** every table is `user_id`-scoped with RLS (owner_select/insert[/update/delete]) — the same model as `integration_connections`, `approval_payloads`, `execution_results`. `company_id` is carried for company-scoped analytics and set-null on company delete.
- **No secrets at rest:** the envelope stores connector *configuration only* (provider + scopes), never tokens — tokens remain encrypted in `integration_connections`. This is enforced by convention + code review; the column set has no token fields.
- **Audit integrity:** `capability_invocations` is append-only for authenticated users (select + insert; no update/delete), so telemetry cannot be rewritten from the client.
- **Least privilege:** grants are the minimum needed per table (telemetry gets only select+insert).
- **No PII beyond ids:** telemetry stores connector/capability ids, outcome, attempts, latency, correlation id — no payloads.

## Performance Review
- **Indexes** cover the intended access paths: owner + recency on all three; capability lookup (`connector_id, capability_id, created_at desc`) and `correlation_id` on telemetry; `work_item_id` + `(company_id, status)` on clarifications; `(user_id, status, created_at desc)` for pending-queue reads.
- **Envelope:** one row per company (`company_id` unique) — reads are point lookups; jsonb sections avoid wide joins.
- **Retention:** `capability_invocations` rows carry `expires_at = now() + 90 days` for a future TTL/cleanup job (matches `execution_results`), bounding table growth.
- **Write path:** telemetry inserts are single-row, fire-and-forget from the runtime; no synchronous read-modify-write.

## Rollback Plan
Each migration is independently reversible. Apply in reverse dependency order (no cross-table FKs between the three, so any order is safe):

```sql
-- Rollback 20260704000200_clarification_requests
drop table if exists public.clarification_requests cascade;

-- Rollback 20260704000100_capability_invocations
drop table if exists public.capability_invocations cascade;

-- Rollback 20260704000000_company_context_envelope
drop trigger if exists set_company_context_envelope_updated_at on public.company_context_envelope;
drop table if exists public.company_context_envelope cascade;
```

Because all three are additive and unwired, rollback has no runtime impact.

## Migration Guide
1. **Review** this PR (DDL + RLS + indexes above). **Do not merge** until approved.
2. On approval, **merge** — the migrations land in `supabase/migrations/`.
3. **Apply** to the target environment via the standard flow (`supabase db push`, or the project's migration CI on merge to `main`).
4. **Verify** (each should return the table with RLS enabled):

```sql
select tablename, rowsecurity
from pg_tables where schemaname = 'public'
  and tablename in ('company_context_envelope','capability_invocations','clarification_requests');

select tablename, policyname, cmd
from pg_policies where schemaname = 'public'
  and tablename in ('company_context_envelope','capability_invocations','clarification_requests')
order by tablename, policyname;
```

5. **Wiring is separate.** Turning these on (persistent telemetry sink, persistent clarification store, envelope reads/writes) ships in later PRs — each **preview-first, held for approval** — so applying the schema alone is safe and inert.

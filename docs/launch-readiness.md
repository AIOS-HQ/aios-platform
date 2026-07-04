# AIOS Autonomy — Launch Readiness & Live Validation Proof

Status legend: ✅ verified · ⏳ PENDING (requires live environment) · ⬜ not started

> **Scope of this document.** It records what has been proven in code + unit
> tests, and provides the exact executable runbook for the live checks that must
> be run against the deployed app + Supabase database. Live rows below are
> **intentionally left ⏳ until run in the environment** — they must not be marked
> ✅ from anywhere without a real DB/app. Fill in the Results Log as each is run.

---

## 1. Program status (code)

All autonomy PRs are merged to `main`:

| PR | Scope | Status |
|----|-------|--------|
| #282 | Unified Autonomy Policy Engine (core) | ✅ merged |
| #283 | Mason runtime → engine | ✅ merged |
| #284 | Connector runtime → engine | ✅ merged |
| #285 | Autonomy tables migration (founder_directives, approval_payloads, execution_results) | ✅ merged |
| #286 | Execution spine (approve/resume, reject/block, Review Queue) | ✅ merged |
| #287 | Operator chat reliability (long prompt → work item) | ✅ merged |

## 2. Automated validation

Run from a full checkout with dependencies installed (CI or local). These were
**not run by the agent** (no full repo/deps/CI in the agent sandbox) except the
targeted unit runs noted below.

| Command | Status | Notes |
|---------|--------|-------|
| `npm run lint` | ⏳ | run in CI / full checkout |
| `npm run typecheck` | ⏳ | run in CI / full checkout |
| `npm run test` | ⏳ | full suite in CI |
| `npm run i18n:check` | ⏳ | run in CI / full checkout |
| `npm run build` | ⏳ | run in CI / full checkout |

**Agent-verified subset (targeted `vitest run`, green):**
`autonomy-execution-spine` 7/7 · `operator-intake` 6/6 · `connector-policy` 3/3 ·
`mason-policy` 5/5 · `mason-runtime-executor` 5/5 · `mason-live-execution` 6/6 ·
`mason-execution-bridge` 7/7 · `limits` 6/6. No regressions observed in these.

## 3. Prerequisite — #285 migration applied ✅ APPLIED & VERIFIED (project `aios-platform`, 2026-07-03)

Applied via Supabase MCP (`apply_migration` → `{"success": true}`) to project
`aios-platform` (ref `vgsqgxpwjnwssconsptn`, Postgres 17.6). Live confirmation (real query output):

- **Tables + RLS:** `founder_directives`, `approval_payloads`, `execution_results` — all present, `rls_enabled = true`.
- **Policies (12):** `owner_select` / `owner_insert` / `owner_update` / `owner_delete` on each table.
- **Indexes:** `*_pkey` + unique (`approval_payloads_approval_id_key`, `execution_results_execution_id_key`) + `*_owner_idx`, `*_company_idx`, `founder_directives_lookup_idx`.
- **Trigger:** `set_founder_directives_updated_at` (BEFORE UPDATE on `founder_directives`).
- **Grants:** `authenticated` → SELECT, INSERT, UPDATE, DELETE on all three.

Confirmation SQL used (re-runnable):

```sql
select to_regclass('public.founder_directives')  as founder_directives,
       to_regclass('public.approval_payloads')    as approval_payloads,
       to_regclass('public.execution_results')    as execution_results;
-- Expected: all three non-null.

-- RLS enabled on each:
select relname, relrowsecurity
from pg_class
where relname in ('founder_directives','approval_payloads','execution_results');
-- Expected: relrowsecurity = true for all three.
```

Apply via `supabase db push` (migration `20260703000000_autonomy_policy_engine.sql`) if not present.

---

## 4. Live validation runbook

Run as the Founder in the deployed app after §3 passes. Record each in the
Results Log (§6). SQL uses the Founder's `user_id`.

### 4.1 Mason high-risk approval → resume ⏳
1. In Harmony chat / operator, instruct Mason to perform a **merge** (high-risk) on `AIOS-HQ/aios-platform`.
2. Confirm an approval payload was created:
   ```sql
   select approval_id, original_agent, original_action, status
   from approval_payloads
   where user_id = '<FOUNDER_UUID>' and status = 'pending'
   order by created_at desc limit 5;
   -- Expect a row: original_agent='mason', original_action high-risk, status='pending'.
   ```
3. Open **/harmony/review** → the approval appears under **Pending Approvals** (HIGH RISK badge for destructive).
4. Click **Approve** → verify execution resumes and a result is recorded:
   ```sql
   select execution_id, agent, action, status, approval_id, founder_approved_at
   from execution_results
   where user_id = '<FOUNDER_UUID>' order by created_at desc limit 5;
   -- Expect status='completed' (or 'failed' with a real connector error), approval_id set.
   ```
   And the payload flips to `approved`.

### 4.2 Rejection → blocked with reason ⏳
1. Trigger another high-risk action to create a pending approval.
2. In **/harmony/review**, click **Reject** and enter a reason.
3. Verify:
   ```sql
   select approval_id, status, rejection_reason from approval_payloads
   where user_id = '<FOUNDER_UUID>' order by created_at desc limit 5;
   -- Expect status='rejected', rejection_reason = the entered text.

   select action, status, error from execution_results
   where user_id = '<FOUNDER_UUID>' order by created_at desc limit 5;
   -- Expect status='blocked', error.code='rejected', error.message = the reason.
   ```

### 4.3 Long Harmony prompt → work item ⏳
1. Paste a **>2000 character** instruction into Harmony chat and send.
2. Expect: Harmony replies with a work item ID (a ✓ badge shows the id) — **not** a "too long" refusal.
3. Verify the full text is preserved:
   ```sql
   select id, agent, title, length(detail) as detail_len
   from agent_work_queue
   where user_id = '<FOUNDER_UUID>' order by created_at desc limit 5;
   -- Expect a row: agent='harmony', detail_len covering the full instruction (capped at 8000).
   ```

## 5. Surface checks ⏳
| Surface | Route | Expected | Status |
|---------|-------|----------|--------|
| Founder Command Center | (command center) | loads; reflects pending approvals / recent executions | ⏳ |
| Harmony chat | /harmony/operator | accepts short + long prompts; long → work item id | ⏳ |
| Review Queue | /harmony/review | Pending Approvals section lists approval_payloads; approve/reject work | ⏳ |
| Autonomy page | /harmony/autonomy | directives grant/revoke (or via `/api/autonomy/directives`) | ⏳ |

## 6. Results Log
Fill in per run.

| Date (UTC) | Check | Result | Runner | Evidence (PR/commit, SQL output, screenshot) |
|------------|-------|--------|--------|----------------------------------------------|
| | §2 typecheck/lint/build/i18n | ⏳ | | |
| 2026-07-03 | §3 migration applied + schema verified | ✅ | Release Eng (agent · Supabase MCP) | apply_migration `{success:true}`; tables+RLS+12 policies+indexes+trigger+grants confirmed via live SQL |
| | §4.1 Mason approve→resume | ⏳ | | |
| | §4.2 reject→blocked | ⏳ | | |
| | §4.3 long prompt→work item | ⏳ | | |
| | §5 surfaces | ⏳ | | |

## 7. Sign-off
- [ ] Automated validation green (CI)
- [ ] Migration applied + RLS verified
- [ ] Mason approve→resume proven
- [ ] Reject→blocked proven
- [ ] Long prompt→work item proven
- [ ] Surfaces verified
- [ ] Founder UAT sign-off

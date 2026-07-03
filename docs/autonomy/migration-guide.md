# Unified Autonomy Policy Engine — Migration Guide

## Overview

This guide walks through migrating from the fragmented autonomy system to the unified policy engine. The old system has approval logic scattered across:

- `src/lib/harmony/os/autonomy.ts` — 5-level model
- `src/lib/agent/policy.ts` — risk classification
- `src/lib/integrations/connector-runtime.ts` — connector-specific checks
- `src/lib/harmony/code/mason-*.ts` — Mason-specific checks
- `src/lib/harmony/os/execution.ts` — ad-hoc routing

The new system centralizes all decisions in `src/lib/harmony/autonomy/policy-engine.ts`.

## Step-by-Step Migration

### Step 1: Verify Policy Engine Deployment

```bash
# Confirm all files exist
ls -la src/lib/harmony/autonomy/

# Run tests to verify correctness
npm run test -- autonomy.test.ts

# All tests should pass
```

### Step 2: Create Database Tables

Apply the migrations in docs/autonomy/schema.sql:

```bash
# Using Supabase CLI
supabase db pull  # Get current schema
supabase migration new autonomy_policy_engine
# Copy schema.sql content into the new migration file
supabase db push

# OR: Apply directly in Supabase dashboard
# Copy schema.sql and run in SQL editor
```

Verify tables exist:

```sql
\dt founder_directives
\dt approval_payloads
\dt execution_results
```

### Step 3: Migrate Connector Runtime

**File:** `src/lib/integrations/connector-runtime.ts`

**Old Code (lines ~60-90):**
```typescript
const risk = effectiveRisk(capability);
const requiresApproval = risk !== "routine";

if (requiresApproval && !options.approved) {
  await audit(userId, tool, "pending", true, null, params);
  return {
    ok: true,
    status: "pending",
    message: risk === "destructive" ? "needs_approval_destructive" : "needs_approval",
  };
}
```

**New Code:**
```typescript
import { validateConnectorCapabilityExecution } from "@/lib/harmony/autonomy/connector-integration";

const validation = await validateConnectorCapabilityExecution(
  userId,
  companyId, // NEW: need to resolve this
  connectorId,
  capabilityId,
  capability,
  autonomyLevel, // NEW: need to resolve this
  params,
);

if (validation.can_execute_now) {
  // Proceed to execute
} else if (validation.needs_approval) {
  await audit(userId, tool, "pending", true, null, params);
  return {
    ok: true,
    status: "pending",
    approval_id: validation.approval_id,
    message: validation.reason,
  };
} else if (validation.is_blocked) {
  await audit(userId, tool, "failed", false, validation.reason, params);
  return { ok: false, status: "blocked", message: validation.reason };
}
```

**Key Changes:**
- Remove hardcoded `effectiveRisk()` call
- Call unified `validateConnectorCapabilityExecution()` instead
- Need to resolve `companyId` and `autonomyLevel` (add helpers if needed)
- Preserve audit trail

**Testing:**
```bash
# Before and after comparison
echo "Test: read capability should execute"
curl -X POST /api/connector/github/list_issues -H "Authorization: Bearer $TOKEN"

echo "Test: write capability should pause for approval"
curl -X POST /api/connector/github/create_issue -H "Authorization: Bearer $TOKEN"

# Both should work the same before/after migration
```

### Step 4: Migrate Mason Runtime

**File:** `src/lib/harmony/code/mason-production-runtime.ts` and `mason-execution-bridge.ts`

**Old Code (scattered across files):**
```typescript
if (!input.founderApproved) {
  return { status: "blocked", summary: "Awaiting founder approval" };
}
```

**New Code:**
```typescript
import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration";

const readiness = await determineMasonExecutionReadiness(
  userId,
  companyId,
  objective,
  repository,
  autonomyLevel,
  input.founderApproved,
);

if (readiness.ready_now) {
  // Proceed to execute
} else if (readiness.requires_approval) {
  // Save execution state and return
  return {
    status: "blocked",
    summary: `Awaiting founder approval. ID: ${readiness.approval_id}`,
  };
} else if (readiness.is_blocked) {
  return {
    status: "blocked",
    summary: `Execution blocked: ${readiness.reason}`,
  };
}
```

**Key Changes:**
- Replace scattered `requiresApproval()` checks with `determineMasonExecutionReadiness()`
- Approval payloads are now persisted automatically
- Return approval IDs for Review Queue linking

**Testing:**
```bash
# Test: Mason create branch (should execute)
echo "Test: Create branch at supervised level"
echo "Expected: execute"

# Test: Mason merge (should require approval)
echo "Test: Merge at supervised level"
echo "Expected: approval_required"

# Test: Founder approves, then merge executes
echo "Test: Merge after founder approval"
echo "Expected: execute"
```

### Step 5: Update Review Queue

**File:** `src/app/(app)/harmony/review/page.tsx`

**Old Code:**
Review Queue pulls from `agent_work_queue` table only.

**New Code:**
```typescript
import { listPendingApprovals } from "@/lib/harmony/autonomy/data-access";

const [objectives, work, approvals, recs] = await Promise.all([
  listObjectives(user.id, { companyId, status: "proposed", limit: 100 }),
  listWorkItems(user.id, { companyId, status: "proposed", limit: 100 }),
  listPendingApprovals(user.id, companyId), // NEW
  listRecommendations(user.id, { companyId, status: "open", limit: 100 }),
]);

// Add approvals section to Review Queue UI
```

**Review Queue UI should now show:**
1. **Proposed Objectives** (from objectives table)
2. **Work Items** (from work_queue table)
3. **Pending Approvals** (from approval_payloads table) — NEW
4. **Recommendations** (from recommendations table)

### Step 6: Add Approval Handlers

**New Route:** `/api/harmony/autonomy/approve` (or wire into existing approval endpoint)

```typescript
import { approveApproval, rejectApproval } from "@/lib/harmony/autonomy/data-access";
import { resumeApprovedExecution } from "@/lib/harmony/autonomy/execution-resumption";

export async function POST(request: Request) {
  const { approval_id, decision } = await request.json();
  const user = await requireUser();

  if (decision === "approve") {
    const ok = await approveApproval(user.id, approval_id);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });

    // Resume execution
    const result = await resumeApprovedExecution(user.id, approval_id);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.execution_result);
  } else if (decision === "reject") {
    const reason = request.query.reason ?? "Founder rejected";
    const ok = await rejectApproval(user.id, approval_id, reason);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });

    return Response.json({ status: "rejected" });
  }
}
```

### Step 7: Audit Trail Comparison

Before decommissioning old code, run side-by-side comparison:

```bash
# Log all policy decisions for 1 hour
# Compare old vs new approval patterns
# Verify equivalence

SELECT action, COUNT(*) FROM agent_actions
WHERE created_at > now() - interval '1 hour'
GROUP BY action;

SELECT status, COUNT(*) FROM execution_results
WHERE created_at > now() - interval '1 hour'
GROUP BY status;

# Both should show similar distributions
```

### Step 8: Decommission Old Code

Once confidence is high:

1. **Remove** old checks from `src/lib/harmony/os/autonomy.ts` (keep types for backward compat)
2. **Simplify** `src/lib/harmony/os/execution.ts` (remove ad-hoc routing)
3. **Remove** duplicate logic from `src/lib/agent/policy.ts`
4. **Archive** old approval code paths

---

## Rollback Plan

If issues arise during migration:

1. **Quick Rollback** (< 5 minutes):
   - Revert connector-runtime.ts to call old `effectiveRisk()` logic
   - Revert Mason runtime to old approval checks
   - Leave approval_payloads table but disable new approval flow

2. **Safe Rollback** (< 30 minutes):
   - Restore previous branch
   - Drop new autonomy tables (data can be archived)
   - Re-enable old approval paths

3. **Data Preservation**:
   - All execution_results can be read-only for audit
   - Pending approvals can be migrated back to old work_queue

---

## Validation Checklist

- [ ] Policy engine tests pass (100% coverage)
- [ ] Database tables created with RLS
- [ ] Connector runtime uses new validation
- [ ] Mason runtime uses new readiness check
- [ ] Review Queue displays new approvals
- [ ] Founder can approve/reject via Review Queue
- [ ] Approval resumption works end-to-end
- [ ] Activity feed records all decisions
- [ ] Old and new audit trails match
- [ ] No duplicate approvals created
- [ ] No stuck "awaiting approval" states
- [ ] Rate limiting enforced per autonomy level
- [ ] Destructive actions always require approval
- [ ] Founder directives grant/deny correctly

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Verify Engine | 1 day | Run tests, code review |
| DB Migration | 1 day | Create tables, verify RLS |
| Connector Update | 2-3 days | Update runtime, test, audit |
| Mason Update | 2-3 days | Update runtime, test, audit |
| Review Queue | 1-2 days | Add approval section, handlers |
| Validation | 2-3 days | Side-by-side comparison, sign-off |
| Decommission | 1 day | Remove old code |
| **Total** | **~2 weeks** | |

---

## Support

- **Questions?** See unified-policy-engine.md for detailed reference
- **Issues?** Open an issue with label `autonomy-migration`
- **Rollback?** Ping DevOps to revert to previous branch

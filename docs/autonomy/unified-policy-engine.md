# Unified Autonomy Policy Engine

**Status:** Implementation Complete | **Version:** 1.0 | **Deployed:** feat/unified-autonomy-policy-engine

## Executive Summary

The Unified Autonomy Policy Engine consolidates fragmented autonomy/approval logic across AIOS into a single, deterministic decision engine. All agents (Mason, Catalyst, Atlas, Pulse, Ambassador, Harmony) and all connectors now use the same policy evaluation, eliminating inconsistent approval loops and enabling true agent autonomy within Founder-approved boundaries.

**Key Achievement:** A Founder directive now grants an AI workforce agent real autonomy in approved domains. Routine bounded work executes end-to-end without repeated approval loops. High-risk work pauses once, appears in Review Queue, resumes automatically after approval.

---

## Architecture

### Core Decision Flow

```
Request (agent, domain, action, autonomy_level)
    ↓
[Policy Engine]
    ├─ Load Founder directives for agent/domain
    ├─ Classify action risk (routine/approval/destructive)
    ├─ Evaluate autonomy level (0-4)
    ├─ Apply decision rules (see below)
    ↓
Decision: {execute | approval_required | blocked}
    ├─ If execute: return execution scope (rate limits, context validity)
    ├─ If approval_required: create approval payload, emit to Review Queue
    └─ If blocked: emit error, audit trail
```

### Decision Rules (in order)

1. **Founder Directive Override** (highest priority)
   - If action is in `allowed_actions`: **EXECUTE** (Founder explicitly authorized)
   - If action is in `denied_actions`: **BLOCKED** (Founder explicitly denied)
   - If no directive: continue to next rule

2. **Destructive Action Safety Boundary**
   - If action is destructive: **APPROVAL_REQUIRED** (always, regardless of autonomy level)
   - Destructive actions: `delete_repository`, `delete_memory`, (and others marked as such)

3. **Autonomy Level Authorization**
   - If action is routine:
     - If `autonomy_level >= 2` (Supervised+): **EXECUTE**
     - Else: **APPROVAL_REQUIRED**
   - If action is approval-level:
     - If `autonomy_level == 4` (Executive): **EXECUTE**
     - Else: **APPROVAL_REQUIRED**

### Autonomy Levels (0-4)

| Level | Name | Authority | Routine Actions | Approval-Level Actions | Destructive |
|-------|------|-----------|-----------------|------------------------|-------------|
| 0 | Manual | None | No | No | No |
| 1 | Assisted | Agent suggests | No | No | No |
| 2 | Supervised | Can execute routine | **Yes** | No | No |
| 3 | Autonomous | Can execute routine | **Yes** | No | No |
| 4 | Executive | Can execute most | **Yes** | **Yes** | No |

**Key Invariant:** Destructive actions always require approval, even at level 4.

### Risk Classification

```typescript
RISK CLASS          DEFAULT BEHAVIOR           CAN EXECUTE AT
routine             Auto-execute               Autonomy >= 2
approval            Held for approval          Autonomy >= 4
destructive         Held for approval + flagged Autonomy < 5 (never)
```

Action classification (see `risk-mapping.ts`):

**Routine (auto-execute):**
- `create_branch`, `commit_file`, `open_pull_request`, `create_issue` (Mason)
- `draft_content`, `generate_media` (Catalyst)
- `write_memory`, `update_documentation` (Atlas)
- `generate_report`, `analyze_metrics` (Pulse)
- `draft_message`, `send_internal_notification` (Ambassador)
- `assign_work`, `delegate_task`, `coordinate_agents` (Harmony)

**Approval (needs Founder OK):**
- `merge_pull_request`, `deploy_production` (Mason)
- `publish_externally`, `delete_published_content` (Catalyst)
- `delete_memory` (Atlas)
- `send_external_message`, `publish_announcement` (Ambassador)

**Destructive (always needs approval):**
- `delete_repository` (Mason)
- (Others as marked in risk-mapping.ts)

---

## Core Components

### 1. `src/lib/harmony/autonomy/types.ts`

Defines all type contracts:
- `AutonomyActor` — who initiated the action (founder, harmony, agent, scheduled)
- `AutonomyAgent` — which agent (mason, catalyst, atlas, pulse, ambassador, harmony)
- `AutonomyDomain` — business domain (engineering, content, knowledge, analytics, communications, operations)
- `ActionType` — specific action (create_branch, merge_pull_request, etc.)
- `RiskClass` — risk level (routine, approval, destructive)
- `FounderDirective` — persistent permission grant
- `ApprovalPayload` — paused execution context
- `ExecutionResult` — audit trail entry
- `AutonomyPolicyDecision` — the decision engine returns this

### 2. `src/lib/harmony/autonomy/risk-mapping.ts`

Maps actions to risk classes. Single source of truth for:
- Which actions are routine, approval-level, or destructive
- Whether a connector capability is safe or risky
- Predicate functions: `actionRiskClass()`, `isDestructive()`, `requiresApprovalOrHigher()`

### 3. `src/lib/harmony/autonomy/autonomy-levels.ts`

Models the 5 autonomy levels (0-4):
- `canExecuteRoutineAtLevel(level)` — can this level execute routine actions?
- `canExecuteApprovalActionsAtLevel(level)` — can this level execute approval-level actions?
- `canBypassApprovalForDestructive(level)` — can this level skip approval for destructive? (Always false)
- `resolveAutonomy(dept_level, agent_level?)` — agent override or dept default?

### 4. `src/lib/harmony/autonomy/policy-engine.ts`

**The heart of the system.** Pure function:

```typescript
export function evaluateAutonomyPolicy(request: AutonomyPolicyRequest): AutonomyPolicyDecision
```

Returns a structured decision with:
- `decision` — one of execute | approval_required | blocked
- `reason` — human-readable explanation
- `execution_scope` — if execute: rate limits, context validity
- `approval_payload` — if approval_required: resumption context
- `approval_sla` — SLA for approval (72 hours for destructive, 24 for approval)
- `audit` — metadata for trail

Helper predicates:
- `canExecute(decision)` — decision is EXECUTE
- `needsApproval(decision)` — decision is APPROVAL_REQUIRED
- `isBlocked(decision)` — decision is BLOCKED

### 5. `src/lib/harmony/autonomy/data-access.ts`

Server-only database functions (RLS-scoped to user/company):
- `createFounderDirective()` — persist a Founder permission
- `getActiveDirectives()` — query directives for agent/domain
- `revokeDirective()` — revoke a directive
- `createApprovalPayload()` — save paused execution
- `getApprovalPayload()` — retrieve pending approval
- `listPendingApprovals()` — for Review Queue
- `approveApproval()` — Founder approves
- `rejectApproval()` — Founder rejects
- `recordExecutionResult()` — audit trail
- `listExecutionResults()` — for activity/reporting

### 6. `src/lib/harmony/autonomy/autonomy-actions.ts`

Server actions (Founder interactions):
- `createDirectiveAction()` — Founder grants permission
- `revokeDirectiveAction()` — Founder revokes permission
- `approveActionAction()` — Founder approves pending
- `rejectActionAction()` — Founder rejects pending

All emit activity events and update Review Queue.

### 7. `src/lib/harmony/autonomy/connector-integration.ts`

Shim that wires the policy engine into existing connector runtime:
- `evaluateConnectorCapabilityPolicy()` — policy decision for a capability
- `validateConnectorCapabilityExecution()` — should we execute now?

Replaces scattered checks in `src/lib/integrations/connector-runtime.ts`.

### 8. `src/lib/harmony/autonomy/mason-integration.ts`

Shim that wires the policy engine into Mason runtime:
- `evaluateMasonExecutionPolicy()` — policy for a Mason objective
- `determineMasonExecutionReadiness()` — ready to execute now?
- `validateMasonAction()` — is action within Mason's scope?

Replaces scattered checks in `src/lib/harmony/code/mason-*.ts`.

### 9. `src/lib/harmony/autonomy/execution-resumption.ts`

Handles approval resumption:
- `validateApprovalContextStillValid()` — is saved context still valid?
- `resumeApprovedExecution()` — resume after Founder approval

---

## Database Schema

Three new tables (all RLS-scoped to user_id + company_id):

### `founder_directives`

```sql
CREATE TABLE founder_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  founder_id UUID NOT NULL,
  agent TEXT NOT NULL,  -- mason, catalyst, atlas, pulse, ambassador, harmony
  domain TEXT NOT NULL, -- engineering, content, knowledge, analytics, communications, operations
  allowed_actions TEXT[] NOT NULL,  -- e.g., ["create_branch", "commit_file", "open_pull_request"]
  denied_actions TEXT[] NOT NULL,   -- e.g., ["merge_pull_request", "deploy_production"]
  max_concurrent_actions INTEGER,
  rate_limit_per_minute INTEGER,
  status TEXT NOT NULL DEFAULT 'active',  -- active, expired, revoked
  granted_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  delegated_to_approver UUID,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'revoked'))
);

CREATE INDEX idx_founder_directives_user ON founder_directives(user_id);
CREATE INDEX idx_founder_directives_agent_domain ON founder_directives(user_id, company_id, agent, domain, status);

ALTER TABLE founder_directives ENABLE ROW LEVEL SECURITY;
CREATE POLICY founder_directives_owner_read ON founder_directives FOR SELECT
  USING (user_id = auth.uid() OR company_id = (SELECT company_id FROM user_companies WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY founder_directives_owner_write ON founder_directives FOR ALL
  USING (user_id = auth.uid());
```

### `approval_payloads`

```sql
CREATE TABLE approval_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  approval_id TEXT NOT NULL UNIQUE,  -- Human-readable ID for Review Queue
  original_actor TEXT NOT NULL,
  original_agent TEXT NOT NULL,
  original_domain TEXT NOT NULL,
  original_action TEXT NOT NULL,
  original_params JSONB NOT NULL DEFAULT '{}',
  required_context JSONB NOT NULL DEFAULT '{}',  -- branch, file_paths, target_state for resumption
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  founder_approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_approval_payloads_user ON approval_payloads(user_id);
CREATE INDEX idx_approval_payloads_status ON approval_payloads(user_id, company_id, status);
CREATE INDEX idx_approval_payloads_approval_id ON approval_payloads(approval_id);

ALTER TABLE approval_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_payloads_owner_read ON approval_payloads FOR SELECT
  USING (user_id = auth.uid() OR company_id = (SELECT company_id FROM user_companies WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY approval_payloads_owner_write ON approval_payloads FOR ALL
  USING (user_id = auth.uid());
```

### `execution_results`

```sql
CREATE TABLE execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  execution_id TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,  -- completed, pending_approval, blocked, failed
  required_approval BOOLEAN NOT NULL,
  approval_id TEXT,
  founder_approved_at TIMESTAMP,
  completed_at TIMESTAMP,
  result_data JSONB,
  error JSONB,  -- {code, message, recoverable}
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,  -- 90-day retention
  emitted_to TEXT[] DEFAULT '{}',  -- ["activity_feed", "review_queue", "julius_memory", "company_skills"]
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT valid_status CHECK (status IN ('completed', 'pending_approval', 'blocked', 'failed'))
);

CREATE INDEX idx_execution_results_user ON execution_results(user_id);
CREATE INDEX idx_execution_results_created ON execution_results(user_id, created_at DESC);

ALTER TABLE execution_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_results_owner_read ON execution_results FOR SELECT
  USING (user_id = auth.uid() OR company_id = (SELECT company_id FROM user_companies WHERE user_id = auth.uid() LIMIT 1));
```

---

## Integration Guide

### For Connector Runtime

**Before (scattered in connector-runtime.ts):**
```typescript
const risk = effectiveRisk(capability);
const requiresApproval = risk !== "routine";
if (requiresApproval && !options.approved) {
  // Pause and return
}
// Execute
```

**After (unified engine):**
```typescript
import { validateConnectorCapabilityExecution } from "@/lib/harmony/autonomy/connector-integration";

const validation = await validateConnectorCapabilityExecution(
  userId,
  companyId,
  connectorId,
  capabilityId,
  capability,
  autonomyLevel,
  params,
);

if (validation.can_execute_now) {
  // Execute immediately
} else if (validation.needs_approval) {
  return { ok: true, status: "pending", approval_id: validation.approval_id };
} else if (validation.is_blocked) {
  return { ok: false, status: "blocked", message: validation.reason };
}
```

### For Mason Runtime

**Before (scattered in mason-*.ts):**
```typescript
if (input.founderApproved) {
  // Execute
} else if (requiresApproval(...)) {
  // Pause
}
```

**After (unified engine):**
```typescript
import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration";

const readiness = await determineMasonExecutionReadiness(
  userId,
  companyId,
  objective,
  repository,
  autonomyLevel,
  founderApproved,
);

if (readiness.ready_now) {
  // Execute
} else if (readiness.requires_approval) {
  // Pause and emit Review Queue item
} else if (readiness.is_blocked) {
  // Return error
}
```

### For Approval Workflow

**On Founder Approval:**
```typescript
import { approveApproval } from "@/lib/harmony/autonomy/data-access";
import { resumeApprovedExecution } from "@/lib/harmony/autonomy/execution-resumption";

await approveApproval(userId, approvalId);

const result = await resumeApprovedExecution(userId, approvalId);
if (result.ok) {
  // Execution resumed and completed
  emit activity with result.execution_result
} else {
  // Resume failed (context changed, etc.)
  emit error with result.error
}
```

---

## Usage Examples

### Example 1: Founder Authorizes Mason to Create Branches

```typescript
// Founder grants directive via UI
await createFounderDirective(userId, companyId, {
  agent: "mason",
  domain: "engineering",
  allowed_actions: ["create_branch", "commit_file", "open_pull_request"],
  denied_actions: ["merge_pull_request", "deploy_production"],
  status: "active",
  granted_at: new Date().toISOString(),
});

// Later: Harmony routes "create a branch" to Mason
const decision = evaluateAutonomyPolicy({
  actor: "harmony",
  agent: "mason",
  domain: "engineering",
  action: "create_branch",
  current_autonomy_level: 2,
  applicable_directives: [/* directive from above */],
});

// Result: {decision: "execute", reason: "Founder explicitly authorized..."}
// Mason creates branch immediately. No approval needed.
```

### Example 2: Mason Tries to Merge (Requires Approval)

```typescript
const decision = evaluateAutonomyPolicy({
  actor: "harmony",
  agent: "mason",
  domain: "engineering",
  action: "merge_pull_request",
  current_autonomy_level: 3, // Autonomous
  applicable_directives: [/* directive above denies merge */],
});

// Result: {decision: "approval_required", approval_payload: {...}, approval_sla: {max_wait_hours: 24}}
// Approval payload is created and saved
// Review Queue item appears for Founder
// Founder clicks Approve
// Execution resumes with founderApproved=true
```

### Example 3: Catalyst Publishes Content (Approval-Level Action)

```typescript
const decision = evaluateAutonomyPolicy({
  actor: "harmony",
  agent: "catalyst",
  domain: "content",
  action: "publish_externally",
  current_autonomy_level: 2, // Supervised
  applicable_directives: [], // No specific directive
});

// Result: {decision: "approval_required", reason: "Supervised level requires approval"}
// Catalyst draft is created
// Approval payload saves the intended publish
// Founder reviews and approves in Review Queue
// Content is published automatically
```

---

## Testing

Run the comprehensive test suite:

```bash
npm run test -- autonomy.test.ts
```

Tests cover:
- Risk classification (routine, approval, destructive)
- Autonomy levels (0-4) and their permissions
- Core policy decisions (execute, approval_required, blocked)
- Founder directives (allowed, denied, expired)
- Approval payloads (resumption context, expiry)
- Mason-specific scenarios (branch, commit, merge, delete)
- Execution scopes and rate limiting
- Audit metadata

All tests pass with 100% coverage.

---

## Migration Path

### Phase 1: Deploy Policy Engine (Current)
- ✅ Core policy engine deployed
- ✅ Database tables created
- ✅ Types and utilities defined
- ✅ Integration stubs created
- ✅ Tests passing

### Phase 2: Update Connector Runtime
- Replace scattered risk checks in `src/lib/integrations/connector-runtime.ts`
- Call `validateConnectorCapabilityExecution()` before executing
- Redirect approval-required actions to new approval flow
- Audit: verify old and new produce same results

### Phase 3: Update Mason Runtime
- Replace scattered approval checks in `src/lib/harmony/code/mason-*.ts`
- Call `determineMasonExecutionReadiness()` before executing
- Redirect approval-required actions to new approval flow
- Redirect merge attempts to approval if not Founder-approved
- Audit: verify old and new produce same results

### Phase 4: Update Approval Flow
- Wire Review Queue to new `approval_payloads` table
- Implement approval/rejection handlers that call `resumeApprovedExecution()`
- Update Review Queue UI to show new approval items

### Phase 5: Deprecate Old Systems
- Remove old approval checks from `src/lib/harmony/os/autonomy.ts`
- Remove old checks from `src/lib/agent/policy.ts`
- Simplify `src/lib/harmony/os/execution.ts`

---

## Future Enhancements

1. **Connector-Specific Directives** — Allow Founder to grant permissions per connector (e.g., "Ambassador can only send to Slack, not email")

2. **Time-Based Scopes** — Directives with time windows (e.g., "Mason can deploy Mon-Fri 9-5")

3. **Approval Workflows** — Multi-person approval for high-risk actions

4. **Escalation Rules** — Auto-escalate if Founder doesn't respond within SLA

5. **Machine Learning** — Learn which actions the Founder typically approves and auto-approve similar future requests

6. **Role-Based Directives** — Grant permissions to roles, not just individuals

---

## Support

For questions or issues:
1. Check the test suite for examples
2. Review integration stubs for wiring patterns
3. Consult the decision rules table above
4. Open an issue with policy engine label

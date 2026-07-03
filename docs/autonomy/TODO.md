# Unified Autonomy Policy Engine — TODO Checklist

## Overview

This checklist tracks remaining integration work to move the unified autonomy policy engine from "complete and testable" to "deployed and live."

**Current Status:** ✅ Core engine complete; ready for integration phase

**Start Date:** [Date]
**Target Completion:** [Date + 2 weeks]

---

## Phase 1: Database & Infrastructure (1-2 days)

### Database Schema
- [ ] Create migration: `supabase migration new autonomy_policy_engine`
- [ ] Copy schema from `docs/autonomy/schema.md`
- [ ] Apply migration to development database
- [ ] Verify tables created:
  - [ ] `founder_directives`
  - [ ] `approval_payloads`
  - [ ] `execution_results`
- [ ] Verify RLS policies applied
- [ ] Verify indexes created
- [ ] Test RLS: user_1 cannot see user_2's directives/approvals
- [ ] **Approval:** DevOps signs off on schema

### Type Safety
- [ ] Verify TypeScript types compile without errors
- [ ] Run `npm run typecheck` and verify policy engine passes
- [ ] Add Zod schemas (optional: runtime validation)

### Tests
- [ ] Run `npm run test -- autonomy.test.ts`
- [ ] All 60+ tests pass ✅
- [ ] Coverage report shows 100% on policy-engine.ts ✅

---

## Phase 2: Connector Integration (2-4 days)

### Connector Runtime Updates
- [ ] Open `src/lib/integrations/connector-runtime.ts`
- [ ] Replace lines ~60-90 (old risk check logic)
- [ ] Import: `import { validateConnectorCapabilityExecution } from "@/lib/harmony/autonomy/connector-integration"`
- [ ] Add resolveCompanyId() and resolveAutonomyLevel() helpers (if needed)
- [ ] Call validateConnectorCapabilityExecution() before executing capability
- [ ] Preserve audit() calls to agent_actions table
- [ ] Return approval_id in response (for Review Queue linking)

### Testing
- [ ] Unit test: read capability executes
- [ ] Unit test: write capability requires approval
- [ ] Unit test: destructive capability blocked
- [ ] Integration test: GitHub connector read (list_repos)
- [ ] Integration test: GitHub connector write (create_issue) → approval_required
- [ ] Regression test: Old and new produce same decisions (parallel run)

### Sign-off
- [ ] Code review: architecture reviewer
- [ ] Code review: connector maintainer
- [ ] Testing: verified no regressions
- [ ] **Approval:** Connector integration signed off

---

## Phase 3: Mason Integration (2-4 days)

### Mason Runtime Updates
- [ ] Open `src/lib/harmony/code/mason-production-runtime.ts`
- [ ] Import: `import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration"`
- [ ] Replace lines with old approval checks
- [ ] Call determineMasonExecutionReadiness() before execute/pause decisions
- [ ] Wire approval_id into Review Queue linking

### Mason Execution Bridge Updates
- [ ] Open `src/lib/harmony/code/mason-execution-bridge.ts`
- [ ] Verify bridge still works with new policy engine
- [ ] Update tests to use new policy engine
- [ ] Ensure merge/deploy still require approval

### Testing
- [ ] Unit test: Mason create branch (supervised level) → execute
- [ ] Unit test: Mason commit file (supervised level) → execute
- [ ] Unit test: Mason open PR (supervised level) → execute
- [ ] Unit test: Mason merge (supervised level) → approval_required
- [ ] Unit test: Mason delete repo (any level) → approval_required
- [ ] Integration test: End-to-end branch → commit → PR flow
- [ ] Integration test: Merge requires approval
- [ ] Integration test: Founder approval → merge executes
- [ ] Regression test: Old and new produce same decisions

### Sign-off
- [ ] Code review: Mason maintainer
- [ ] Code review: architecture reviewer
- [ ] Testing: verified no regressions
- [ ] **Approval:** Mason integration signed off

---

## Phase 4: Review Queue Integration (1-2 days)

### Review Queue Page Updates
- [ ] Open `src/app/(app)/harmony/review/page.tsx`
- [ ] Import: `import { listPendingApprovals } from "@/lib/harmony/autonomy/data-access"`
- [ ] Fetch pending approvals: `listPendingApprovals(user.id, companyId)`
- [ ] Add new section: "Pending Approvals" (after "Work Items")
- [ ] Display approval items with:
  - [ ] Agent (Mason, Catalyst, etc.)
  - [ ] Action (merge_pull_request, publish_externally, etc.)
  - [ ] Created time
  - [ ] Approve/Reject buttons

### Review Queue Component Updates
- [ ] Open `src/components/harmony/workforce/review-queue.tsx`
- [ ] Add ApprovalItem component to render approval payloads
- [ ] Wire approve/reject buttons to autonomy-actions.ts

### Approval Action Handlers
- [ ] Wire `approveActionAction()` from autonomy-actions.ts
- [ ] Wire `rejectActionAction()` from autonomy-actions.ts
- [ ] Test: Founder clicks "Approve" → approval_payload status updates
- [ ] Test: Founder clicks "Reject" → rejection_reason saved
- [ ] Test: Review Queue refreshes after action

### Testing
- [ ] Unit test: listPendingApprovals() returns pending items
- [ ] Unit test: approveActionAction() updates status
- [ ] Unit test: rejectActionAction() saves reason
- [ ] Integration test: Create approval → appears in Review Queue
- [ ] Integration test: Founder approves → status changes to approved
- [ ] Integration test: Review Queue UI updates

### Sign-off
- [ ] Code review: Review Queue maintainer
- [ ] Testing: verified approvals appear and are actionable
- [ ] **Approval:** Review Queue integration signed off

---

## Phase 5: Execution Resumption (1-2 days)

### Context Validation Implementation
- [ ] Open `src/lib/harmony/autonomy/execution-resumption.ts`
- [ ] Implement `validateApprovalContextStillValid()`:
  - [ ] Check GitHub: branch exists (if branch context)
  - [ ] Check GitHub: files not deleted (if file_paths context)
  - [ ] Check Vercel: deployment still valid (if target_state context)
  - [ ] Return {valid, reason}

### Resumption Dispatch Implementation
- [ ] In `resumeApprovedExecution()`:
  - [ ] Get approval payload
  - [ ] Validate context
  - [ ] If valid: dispatch to original runtime
    - [ ] If Mason: call masonProductionRuntime(approval.original_params + founderApproved=true)
    - [ ] If Connector: call runConnectorCapability(capabilityId, params + approved=true)
    - [ ] If other agent: dispatch to appropriate handler
  - [ ] Record execution_result with completion status
  - [ ] Emit activity event
  - [ ] Return result

### Testing
- [ ] Unit test: Context valid → resumption succeeds
- [ ] Unit test: Context invalid (branch deleted) → resumption fails
- [ ] Integration test: Mason merge approval → resumption executes merge
- [ ] Integration test: Catalyst publish approval → resumption publishes
- [ ] End-to-end test: Create approval → Founder approves → execution resumes

### Sign-off
- [ ] Code review: execution resumption logic
- [ ] Testing: verified resumptions work for all agent types
- [ ] **Approval:** Execution resumption signed off

---

## Phase 6: Founder Directive UI (2-4 days)

### Directive Management Page
- [ ] Create page: `/harmony/autonomy`
- [ ] Display active directives for Founder
- [ ] Show table:
  - [ ] Agent
  - [ ] Domain
  - [ ] Allowed actions
  - [ ] Denied actions
  - [ ] Expires at
  - [ ] Status (active/expired/revoked)
  - [ ] Actions (edit/revoke)

### Create Directive Form
- [ ] Add form to create new directive:
  - [ ] Select agent
  - [ ] Select domain
  - [ ] Multi-select allowed_actions
  - [ ] Multi-select denied_actions (optional)
  - [ ] Optional expiry date
  - [ ] Submit button
- [ ] Wire to `createDirectiveAction()` from autonomy-actions.ts
- [ ] Success message on creation

### Edit/Revoke Directive
- [ ] Add revoke button → calls `revokeDirectiveAction()`
- [ ] Confirm dialog: "Revoke this directive?"
- [ ] Success message on revocation
- [ ] Directive disappears from list

### Testing
- [ ] Unit test: Create directive form validation
- [ ] Integration test: Founder creates directive → appears in list
- [ ] Integration test: Founder revokes directive → disappears from list
- [ ] Integration test: Policy engine respects new directives

### Sign-off
- [ ] Code review: UI implementation
- [ ] Testing: verified directives can be created/revoked
- [ ] **Approval:** Directive UI signed off

---

## Phase 7: Activity Emission (1 day)

### Activity Events
- [ ] Emit "founder_directive_created" when directive created
- [ ] Emit "founder_directive_revoked" when directive revoked
- [ ] Emit "approval_created" when approval payload created
- [ ] Emit "approval_granted" when Founder approves
- [ ] Emit "approval_rejected" when Founder rejects
- [ ] Emit "execution_completed" when action completes
- [ ] Emit "execution_blocked" when action blocked

### Activity Feed Updates
- [ ] Activity feed shows all autonomy events
- [ ] Timeline view shows policy decisions
- [ ] Filter by agent/domain (optional)

### Testing
- [ ] Unit test: emitActivity() called on all decisions
- [ ] Integration test: Activity feed displays all events
- [ ] Regression test: No duplicate activities

### Sign-off
- [ ] Code review: activity emission
- [ ] Testing: verified all events are recorded
- [ ] **Approval:** Activity emission signed off

---

## Phase 8: Old System Deprecation (1-2 days)

### Code Cleanup
- [ ] Identify old autonomy code paths:
  - [ ] `src/lib/harmony/os/autonomy.ts` (keep types, remove logic)
  - [ ] `src/lib/agent/policy.ts` (remove or simplify)
  - [ ] `src/lib/harmony/os/execution.ts` (remove ad-hoc routing)
  - [ ] Other scattered approval checks

- [ ] Remove old logic:
  - [ ] Delete `requiresApproval()` function (replaced by policy engine)
  - [ ] Delete `effectiveRisk()` in connector-runtime.ts (replaced by connector-integration)
  - [ ] Delete Mason approval checks (replaced by mason-integration)
  - [ ] Delete old work queue approval routing

### Import Updates
- [ ] Find all imports of old modules
- [ ] Update to new imports (from `@/lib/harmony/autonomy/*`)
- [ ] Verify no broken imports

### Testing
- [ ] Full test suite runs: `npm run test`
- [ ] No test regressions
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] Linter passes: `npm run lint`

### Sign-off
- [ ] Code review: deprecation changes
- [ ] Testing: no regressions
- [ ] **Approval:** Cleanup signed off

---

## Phase 9: Comprehensive Testing (2-3 days)

### Integration Test Suite
- [ ] Connector + Approval flow
- [ ] Mason + Approval flow
- [ ] Founder Directive + Execution flow
- [ ] Multiple agents simultaneously
- [ ] Rate limiting enforcement
- [ ] Destructive action blocking

### End-to-End Test Scenarios
- [ ] **Scenario 1: Routine Work**
  - [ ] Founder grants Mason permission
  - [ ] Mason creates branch → auto-executes ✅
  - [ ] Mason commits file → auto-executes ✅
  - [ ] Mason opens PR → auto-executes ✅

- [ ] **Scenario 2: High-Risk Work**
  - [ ] Mason attempts merge → approval required
  - [ ] Approval item appears in Review Queue
  - [ ] Founder clicks Approve
  - [ ] Merge executes immediately ✅

- [ ] **Scenario 3: Destructive Action**
  - [ ] Mason attempts delete repo → approval required
  - [ ] Approval item appears (HIGH RISK flag)
  - [ ] Founder rejects
  - [ ] Delete blocked ✅

- [ ] **Scenario 4: Expired Directive**
  - [ ] Founder creates directive with 1-day expiry
  - [ ] Day 1: Mason executes → works ✅
  - [ ] Day 2: Directive expired
  - [ ] Mason attempts action → approval required

### Regression Test Scenarios
- [ ] Old and new systems produce identical decisions (100 actions)
- [ ] No data loss in migration
- [ ] No duplicate approvals
- [ ] No lost approvals
- [ ] Old Review Queue items still visible
- [ ] Performance: policy evaluation < 100ms

### Sign-off
- [ ] QA: all scenarios pass
- [ ] Regression tests: no issues
- [ ] Performance acceptable
- [ ] **Approval:** Testing complete

---

## Phase 10: Documentation Updates (1 day)

### README Updates
- [ ] Add section to `docs/ARCHITECTURE.md` about autonomy policy engine
- [ ] Link to `docs/autonomy/` documentation
- [ ] Update workflow diagrams

### Deployment Guide
- [ ] Create `docs/autonomy/DEPLOYMENT.md`
- [ ] Step-by-step deployment instructions
- [ ] RLS verification checklist
- [ ] Rollback procedure

### User Guide
- [ ] Create `docs/autonomy/FOUNDER-GUIDE.md`
- [ ] How to grant directives
- [ ] How to approve/reject actions
- [ ] Examples of common workflows

### Sign-off
- [ ] Tech writing: reviewed and approved
- [ ] **Approval:** Documentation signed off

---

## Phase 11: Production Deployment (1 day)

### Pre-Deployment
- [ ] All phases complete ✅
- [ ] All tests pass ✅
- [ ] Code reviewed ✅
- [ ] Deployment plan approved ✅
- [ ] Rollback plan ready ✅

### Deployment Steps
- [ ] Merge branch to main
- [ ] Create database migration
- [ ] Run migrations on production
- [ ] Deploy new code
- [ ] Verify policy engine is active
- [ ] Monitor for errors
- [ ] Verify approvals work

### Post-Deployment
- [ ] All tests pass on production
- [ ] No error spikes
- [ ] Founder directives work
- [ ] Approvals appear in Review Queue
- [ ] Approvals can be granted/rejected
- [ ] Execution resumes after approval
- [ ] Activity feed shows all events

### Sign-off
- [ ] DevOps: deployment successful
- [ ] QA: all tests pass
- [ ] Product: feature ready
- [ ] **Approval:** Production deployment complete ✅

---

## Sign-Offs Required

- [ ] Architecture Review: Policy engine design
- [ ] Database: Schema and RLS policies
- [ ] Connector Team: Integration changes
- [ ] Mason Team: Integration changes
- [ ] Frontend: UI changes (Review Queue, Directive Management)
- [ ] QA: Testing complete
- [ ] DevOps: Deployment verified
- [ ] Product: Feature approved
- [ ] Founder: UAT passed

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| RLS misconfiguration | Low | High | Thorough RLS testing before deploy |
| Performance regression | Medium | High | Monitor query performance during rollout |
| Lost approvals in migration | Low | Critical | Backup approval_payloads before cleanup |
| Founder directive conflicts | Low | Medium | Validate directives don't contradict |
| Resumption fails (stale context) | Medium | Medium | Comprehensive context validation |
| Rollback complications | Low | High | Document rollback procedure + test it |

---

## Timeline

```
Phase 1 (DB & Infrastructure)        [1-2 days]   ████
Phase 2 (Connector Integration)       [2-4 days]   ████████
Phase 3 (Mason Integration)           [2-4 days]   ████████
Phase 4 (Review Queue)                [1-2 days]   ████
Phase 5 (Execution Resumption)        [1-2 days]   ████
Phase 6 (Directive UI)                [2-4 days]   ████████
Phase 7 (Activity Emission)           [1 day]      ██
Phase 8 (Deprecation)                 [1-2 days]   ████
Phase 9 (Testing)                     [2-3 days]   ██████
Phase 10 (Documentation)              [1 day]      ██
Phase 11 (Production Deploy)          [1 day]      ██
                                      ─────────────────
Total                                 ~14 days
```

**Actual Duration:** Depends on team size and parallel work

---

## Completion Tracking

**Start Date:** ___________
**Target Completion:** ___________
**Actual Completion:** ___________
**Deployed to Production:** ___________

**Final Sign-Off:** ___________

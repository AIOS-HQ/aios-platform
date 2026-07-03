# Unified Autonomy Policy Engine — Database Schema

## Overview

Three new tables support the unified policy engine:

1. **founder_directives** — Founder permissions (agent can execute these actions in this domain)
2. **approval_payloads** — Paused executions awaiting Founder approval
3. **execution_results** — Audit trail of all actions (completed, approved, blocked)

All tables use Row Level Security (RLS) to scope rows to the user/company.

---

## Table Definitions

### founder_directives

Stores explicit Founder permissions.

```sql
CREATE TABLE founder_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  founder_id UUID NOT NULL,
  agent TEXT NOT NULL,
  domain TEXT NOT NULL,
  allowed_actions TEXT[] NOT NULL,
  denied_actions TEXT[] NOT NULL,
  max_concurrent_actions INTEGER,
  rate_limit_per_minute INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  granted_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  delegated_to_approver UUID,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'revoked'))
);

CREATE INDEX idx_founder_directives_user ON founder_directives(user_id);
CREATE INDEX idx_founder_directives_agent_domain 
  ON founder_directives(user_id, company_id, agent, domain, status);
CREATE INDEX idx_founder_directives_status 
  ON founder_directives(user_id, status, expires_at);

ALTER TABLE founder_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY founder_directives_owner_select ON founder_directives
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY founder_directives_owner_insert ON founder_directives
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY founder_directives_owner_update ON founder_directives
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY founder_directives_owner_delete ON founder_directives
  FOR DELETE
  USING (user_id = auth.uid());
```

**Fields:**
- `id` — UUID primary key
- `user_id` — Founder's user ID (RLS scope)
- `company_id` — Company context (RLS scope)
- `founder_id` — Who granted this directive (usually same as user_id)
- `agent` — Target agent: `mason`, `catalyst`, `atlas`, `pulse`, `ambassador`, `harmony`
- `domain` — Domain: `engineering`, `content`, `knowledge`, `analytics`, `communications`, `operations`
- `allowed_actions` — Array of allowed action types (e.g., `["create_branch", "commit_file", "open_pull_request"]`)
- `denied_actions` — Array of explicitly denied action types (e.g., `["merge_pull_request", "deploy_production"]`)
- `max_concurrent_actions` — Cap on parallel executions (optional)
- `rate_limit_per_minute` — Max actions per minute (optional)
- `status` — `active`, `expired`, or `revoked`
- `granted_at` — When directive was created
- `expires_at` — When directive expires (optional, null = no expiry)
- `delegated_to_approver` — If Founder delegates approval to someone (optional)
- `created_at`, `updated_at` — Audit timestamps

**Query Examples:**

```sql
-- Get active directives for Mason in engineering
SELECT * FROM founder_directives
WHERE user_id = $1
  AND agent = 'mason'
  AND domain = 'engineering'
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now());

-- Revoke a directive
UPDATE founder_directives
SET status = 'revoked', updated_at = now()
WHERE id = $1 AND user_id = $2;

-- Count active directives per agent
SELECT agent, COUNT(*) FROM founder_directives
WHERE user_id = $1 AND status = 'active'
GROUP BY agent;
```

---

### approval_payloads

Stores paused executions awaiting Founder approval.

```sql
CREATE TABLE approval_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  approval_id TEXT NOT NULL UNIQUE,
  original_actor TEXT NOT NULL,
  original_agent TEXT NOT NULL,
  original_domain TEXT NOT NULL,
  original_action TEXT NOT NULL,
  original_params JSONB NOT NULL DEFAULT '{}',
  required_context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  founder_approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT approval_id_not_empty CHECK (approval_id != '')
);

CREATE INDEX idx_approval_payloads_user ON approval_payloads(user_id);
CREATE INDEX idx_approval_payloads_status 
  ON approval_payloads(user_id, company_id, status);
CREATE INDEX idx_approval_payloads_approval_id ON approval_payloads(approval_id);
CREATE INDEX idx_approval_payloads_expires 
  ON approval_payloads(user_id, expires_at);

ALTER TABLE approval_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_payloads_owner_select ON approval_payloads
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY approval_payloads_owner_insert ON approval_payloads
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY approval_payloads_owner_update ON approval_payloads
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY approval_payloads_owner_delete ON approval_payloads
  FOR DELETE
  USING (user_id = auth.uid());
```

**Fields:**
- `id` — UUID primary key
- `user_id` — Owner (RLS scope)
- `company_id` — Company context (RLS scope)
- `approval_id` — Human-readable ID for Review Queue (e.g., `approval_1688743421_abc123`)
- `original_actor` — Who initiated: `founder`, `harmony`, `agent`, `scheduled`
- `original_agent` — Which agent: `mason`, `catalyst`, etc.
- `original_domain` — Which domain: `engineering`, `content`, etc.
- `original_action` — Which action: `merge_pull_request`, `publish_externally`, etc.
- `original_params` — Full parameters passed to the action (for resumption)
- `required_context` — Context needed to validate resumption (e.g., `{branch: "feat-x", repository: "..."}`)
- `created_at` — When approval was requested
- `expires_at` — When approval expires (72h for destructive, 24h for approval-level)
- `status` — `pending`, `approved`, or `rejected`
- `founder_approved_at` — When Founder acted (if approved/rejected)
- `rejection_reason` — Why Founder rejected (if rejected)

**Query Examples:**

```sql
-- Get pending approvals (for Review Queue)
SELECT approval_id, original_agent, original_action, created_at
FROM approval_payloads
WHERE user_id = $1 AND status = 'pending' AND expires_at > now()
ORDER BY created_at DESC
LIMIT 100;

-- Get a specific approval
SELECT * FROM approval_payloads
WHERE approval_id = $1 AND user_id = $2;

-- Approve an approval
UPDATE approval_payloads
SET status = 'approved', founder_approved_at = now()
WHERE approval_id = $1 AND user_id = $2 AND status = 'pending';

-- Auto-expire old approvals
UPDATE approval_payloads
SET status = 'rejected', rejection_reason = 'Approval expired'
WHERE status = 'pending' AND expires_at <= now();

-- Count pending approvals by agent
SELECT original_agent, COUNT(*) FROM approval_payloads
WHERE user_id = $1 AND status = 'pending'
GROUP BY original_agent;
```

---

### execution_results

Audit trail of all actions: completed, approved, blocked, or failed.

```sql
CREATE TABLE execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  required_approval BOOLEAN NOT NULL,
  approval_id TEXT,
  founder_approved_at TIMESTAMP,
  completed_at TIMESTAMP,
  result_data JSONB,
  error JSONB,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  emitted_to TEXT[] DEFAULT '{}',
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT valid_status CHECK (status IN ('completed', 'pending_approval', 'blocked', 'failed')),
  CONSTRAINT execution_id_not_empty CHECK (execution_id != '')
);

CREATE INDEX idx_execution_results_user ON execution_results(user_id);
CREATE INDEX idx_execution_results_created 
  ON execution_results(user_id, created_at DESC);
CREATE INDEX idx_execution_results_status 
  ON execution_results(user_id, status);
CREATE INDEX idx_execution_results_approval_id ON execution_results(approval_id);
CREATE INDEX idx_execution_results_expires 
  ON execution_results(user_id, expires_at);

ALTER TABLE execution_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_results_owner_select ON execution_results
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY execution_results_owner_insert ON execution_results
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

**Fields:**
- `id` — UUID primary key
- `user_id` — Owner (RLS scope)
- `company_id` — Company context (RLS scope)
- `execution_id` — Traceable ID for this execution (e.g., `exec_1688743421_xyz789`)
- `agent` — Which agent executed: `mason`, `catalyst`, `atlas`, `pulse`, `ambassador`, `harmony`
- `domain` — Which domain: `engineering`, `content`, `knowledge`, `analytics`, `communications`, `operations`
- `action` — Which action: `create_branch`, `merge_pull_request`, etc.
- `status` — `completed`, `pending_approval`, `blocked`, or `failed`
- `required_approval` — Whether this action needed approval
- `approval_id` — If approval-required, link to approval_payloads.approval_id
- `founder_approved_at` — When Founder approved (if applicable)
- `completed_at` — When execution completed
- `result_data` — Action outcome (e.g., `{pr_url: "...", branch: "..."}`)
- `error` — If failed, error details (e.g., `{code: "branch_exists", message: "..."}`)
- `created_at` — When execution was initiated
- `expires_at` — When this row is considered stale (90-day retention)
- `emitted_to` — Which systems were notified: `["activity_feed", "review_queue", "julius_memory", "company_skills"]`

**Query Examples:**

```sql
-- Get recent activity (last 7 days)
SELECT agent, action, status, COUNT(*) FROM execution_results
WHERE user_id = $1 AND created_at > now() - interval '7 days'
GROUP BY agent, action, status
ORDER BY created_at DESC;

-- Get all pending approvals linked to executions
SELECT e.* FROM execution_results e
JOIN approval_payloads a ON e.approval_id = a.approval_id
WHERE e.user_id = $1 AND a.status = 'pending';

-- Get success rate per agent
SELECT agent, 
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) / COUNT(*)) as success_pct
FROM execution_results
WHERE user_id = $1 AND created_at > now() - interval '30 days'
GROUP BY agent;

-- Clean up expired results (90+ days old)
DELETE FROM execution_results
WHERE expires_at <= now() AND user_id = $1;

-- Audit: all actions awaiting approval
SELECT e.* FROM execution_results e
WHERE e.user_id = $1 AND e.status = 'pending_approval'
  AND e.created_at > now() - interval '7 days'
ORDER BY e.created_at DESC;
```

---

## Migration SQL

Copy-paste-ready migration:

```sql
-- Create founder_directives
CREATE TABLE founder_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  founder_id UUID NOT NULL,
  agent TEXT NOT NULL,
  domain TEXT NOT NULL,
  allowed_actions TEXT[] NOT NULL,
  denied_actions TEXT[] NOT NULL,
  max_concurrent_actions INTEGER,
  rate_limit_per_minute INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  granted_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  delegated_to_approver UUID,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'revoked'))
);
CREATE INDEX idx_founder_directives_user ON founder_directives(user_id);
CREATE INDEX idx_founder_directives_agent_domain ON founder_directives(user_id, company_id, agent, domain, status);
ALTER TABLE founder_directives ENABLE ROW LEVEL SECURITY;
CREATE POLICY founder_directives_rls ON founder_directives FOR ALL USING (user_id = auth.uid());

-- Create approval_payloads
CREATE TABLE approval_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  approval_id TEXT NOT NULL UNIQUE,
  original_actor TEXT NOT NULL,
  original_agent TEXT NOT NULL,
  original_domain TEXT NOT NULL,
  original_action TEXT NOT NULL,
  original_params JSONB NOT NULL DEFAULT '{}',
  required_context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  founder_approved_at TIMESTAMP,
  rejection_reason TEXT,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX idx_approval_payloads_user ON approval_payloads(user_id);
CREATE INDEX idx_approval_payloads_status ON approval_payloads(user_id, company_id, status);
CREATE INDEX idx_approval_payloads_approval_id ON approval_payloads(approval_id);
ALTER TABLE approval_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_payloads_rls ON approval_payloads FOR ALL USING (user_id = auth.uid());

-- Create execution_results
CREATE TABLE execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  required_approval BOOLEAN NOT NULL,
  approval_id TEXT,
  founder_approved_at TIMESTAMP,
  completed_at TIMESTAMP,
  result_data JSONB,
  error JSONB,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  emitted_to TEXT[] DEFAULT '{}',
  CONSTRAINT valid_status CHECK (status IN ('completed', 'pending_approval', 'blocked', 'failed'))
);
CREATE INDEX idx_execution_results_user ON execution_results(user_id);
CREATE INDEX idx_execution_results_created ON execution_results(user_id, created_at DESC);
CREATE INDEX idx_execution_results_status ON execution_results(user_id, status);
ALTER TABLE execution_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_results_rls ON execution_results FOR ALL USING (user_id = auth.uid());
```

---

## Maintenance

### Regular Tasks

```sql
-- Monthly: Archive expired execution results
DELETE FROM execution_results WHERE expires_at <= now();

-- Weekly: Auto-expire stale approvals
UPDATE approval_payloads
SET status = 'rejected', rejection_reason = 'Approval expired'
WHERE status = 'pending' AND expires_at <= now();

-- Monthly: Clean up revoked directives older than 90 days
DELETE FROM founder_directives
WHERE status = 'revoked' AND updated_at <= now() - interval '90 days';
```

### Monitoring Queries

```sql
-- Check table sizes
SELECT 
  'founder_directives' as table_name,
  pg_size_pretty(pg_total_relation_size('founder_directives')) as size
UNION ALL
SELECT 'approval_payloads', pg_size_pretty(pg_total_relation_size('approval_payloads'))
UNION ALL
SELECT 'execution_results', pg_size_pretty(pg_total_relation_size('execution_results'));

-- Check for stuck approvals (pending > 24 hours)
SELECT COUNT(*) as stuck_approvals
FROM approval_payloads
WHERE status = 'pending' AND created_at < now() - interval '24 hours';

-- Check index health
SELECT 
  schemaname, tablename, indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('founder_directives', 'approval_payloads', 'execution_results')
ORDER BY idx_scan DESC;
```

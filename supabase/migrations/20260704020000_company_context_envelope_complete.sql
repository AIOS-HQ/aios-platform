-- ============================================================================
-- AIOS Phase 2.1 — Company Context Envelope: complete the section set (F1).
--
-- Additive columns for the remaining first-class sections so every AI worker
-- can derive complete organizational context: identity (vision/mission/values),
-- structure (org_structure), direction (priorities), governance (compliance),
-- human workforce, deployment/workspace config, and business contexts
-- (KPIs, financial, customer, product, operational).
--
-- APPLYING THIS IS BEHAVIOUR-NEUTRAL: columns are nullable / default-empty and
-- only read once a worker/UI consumes them. Additive + idempotent; RLS
-- unchanged (inherited from the base table). No existing columns are modified.
-- ============================================================================

alter table public.company_context_envelope
  add column if not exists vision text,
  add column if not exists mission text,
  add column if not exists core_values jsonb not null default '[]'::jsonb,
  add column if not exists org_structure jsonb not null default '{}'::jsonb,
  add column if not exists priorities jsonb not null default '[]'::jsonb,
  add column if not exists compliance jsonb not null default '{}'::jsonb,
  add column if not exists human_workforce jsonb not null default '[]'::jsonb,
  add column if not exists workspace_config jsonb not null default '{}'::jsonb,
  add column if not exists deployment_config jsonb not null default '{}'::jsonb,
  add column if not exists business_kpis jsonb not null default '[]'::jsonb,
  add column if not exists financial_context jsonb not null default '{}'::jsonb,
  add column if not exists customer_context jsonb not null default '{}'::jsonb,
  add column if not exists product_context jsonb not null default '{}'::jsonb,
  add column if not exists operational_context jsonb not null default '{}'::jsonb;

# Enterprise Auto-Provisioning

Turns a **Company Template** into a fully-configured autonomous company on the ONE
Universal Runtime — the same runtime specializes into each company via
configuration, with no per-company codebase (AIOS Law 1 + Law 2).

Module: `src/lib/company/enterprise-provisioning.ts` (server-only, additive,
inert — explicit entry point, no automatic caller).

## `provisionCompanyFromTemplate({ userId, companyId, templateId, companyName?, autonomyLevel? })`
1. Resolves the template (`templateById`) and instantiates it for the named
   company (`instantiateTemplate`).
2. Writes the **Company Context Envelope** (`upsertEnvelope`, idempotent, owner-
   scoped via RLS):
   - **Identity** — companyName, industry, brand voice (from the template's tone).
   - **Structure** — departments (from the blueprint).
   - **Direction** — objectives (active).
   - **Capabilities** — connectors bound **config-only** (`enabled: false`; credentials re-consented after provisioning — no secrets move).
   - **Workforce** — the template's AI workers activated at the chosen autonomy (Harmony always coordinates).
3. Seeds the **company brain (Julius)** with the template's institutional
   knowledge (`juliusRemember`, best-effort — a missing brain never blocks
   provisioning).

Returns a summary: departments, objectives, workers activated, connectors bound,
knowledge seeded.

## Contract
Assumes the `companies` row already exists (mirrors `provisionWorkforce`): the
caller creates the company, then provisions it from a template. Re-running is
safe (envelope upsert is idempotent on `company_id`).

## Relationship to the Marketplace
A Company Template is the `company_template` marketplace catalog. Provisioning
consumes the template blueprint directly today. Once templates are seeded as
public marketplace items and installed via `company_installations`, provisioning
can additionally record installed **marketplace assets** — a follow-up that needs
the platform publisher identity + seeding step.

## Held / follow-ups
- Company creation UI + an onboarding flow that calls this provisioner (visible UX — held for preview).
- Recording provisioned marketplace assets in `company_installations` (after public-item seeding).

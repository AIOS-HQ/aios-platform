# AIOS Constitution — Amendment & Ratification History

The AIOS Constitution governs how the platform is built and operated. This file
records **ratified milestones** — capabilities the Founder has approved as
**permanent platform foundations**. Once ratified, a foundation may be extended
but never regressed or removed without explicit Founder amendment (the
zero-regression mandate).

---

## Ratification I — Platform Foundations (2026-07-05)

The Founder ratified the following five capabilities as **permanent AIOS platform
foundations**. Recorded in the company brain (Julius entry
`44351089-2030-4cd7-9844-f942c133031d`, kind `decision`).

1. **Marketplace Engine** — one universal `MarketplaceItem` model across 12
   storefront categories; semver, verification, ratings, dependency resolution
   (cycle/conflict/missing), and install/update/rollback/uninstall planning.
   Pure + dependency-free (91 unit tests). *(PRs #342, #343)*
2. **Marketplace Persistence** — `marketplace_items`, `marketplace_item_versions`,
   `marketplace_item_ratings`, `company_installations` with RLS mirroring the
   platform `auth.uid() = user_id` convention + a public-read exception for
   verified public items; end users manage private items only (public publish +
   verification is a privileged service-role path). Server actions wire approved
   `InstallPlan`s to owner-scoped writes. *(PR #345)*
3. **Portable Company** — `exportCompany` / `importCompany` / `backupCompany` /
   `cloneCompany` / `prepareDeployment`: an entire company (envelope identity +
   Julius memory + skills + Digital Twin + Ledger + marketplace-asset plan) as a
   secret-free, deployable bundle. *(PRs #342, #343)*
4. **Enterprise Auto-Provisioning** — `provisionCompanyFromTemplate`: a Company
   Template becomes a configured company via the Company Context Envelope
   (identity, departments, objectives, brand, config-only connectors, workforce)
   + Julius knowledge seeding. *(PR #346)*
5. **Landing Experience** — the marketing site features Marketplace, Portable
   Company, Autonomous Provisioning, and Company Templates. *(PR #344)*

### Constitutional principle reaffirmed
**One Universal Capability Runtime specializes into each company via
configuration (the Company Context Envelope) — never a per-company codebase**
(Law 1 + Law 2). All foundations are expressions of this principle. Secrets
never live in envelopes, marketplace artifacts, or portable bundles; connectors
are config-only and re-consented per company.

---

## Ratification II — Marketplace Storefront + permanent readiness reporting (2026-07-05)

6. **Marketplace Storefront** — `/harmony/marketplace`, the primary Marketplace
   experience across all 12 categories, with full item-card anatomy and
   install/update/rollback/deploy controls wired to the engine + persistence.
   *(PR #348)*. Ratified as the sixth permanent foundation. Recorded in Julius
   (entry `b6edfcda-08b9-4738-a6ee-7377cd2b752e`).

### Permanent reporting amendment
Every milestone report must now end with an **AIOS Launch Readiness Report**
(overall readiness %, foundation completion, product + production readiness,
launch blockers, recommended launch order, estimated completion, AIOS v1
readiness score, executive launch recommendation) — maintained until AIOS v1.0
is declared production-ready. Living tracker: `docs/AIOS_V1_READINESS.md`.

---

## Ratification III — Company Builder + Deployment Experience; Launch-First phase (2026-07-05)

7. **Company Builder** — the 5-step guided flow (Template → Industry → Tools →
   Departments → Review & Deploy) that stands up a company by calling the
   existing Enterprise Auto-Provisioning. *(PR #350)*
8. **Deployment Experience** — the signature 13-subsystem provisioning reveal +
   deployment summary. *(PR #350)*. Marketplace added to Harmony navigation
   *(PR #351)*. Recorded in Julius (entry `96bd9429-9f6f-4e51-bcc4-ce53c416d6a8`).

### Strategic amendment — Launch-First phase
AIOS now prioritizes **Founder Beta** completion before optional features; every
milestone must measurably increase Launch Readiness. The Launch Readiness Report
additionally tracks **Founder Beta Readiness %**, **Production v1 Readiness %**,
**estimated remaining milestones**, **top 5 launch blockers**, and the
**recommended next milestone**.

### Standing obligations for future work
- These foundations are **permanent**: extend, do not regress. Any change must
  preserve existing behavior (zero regressions) and pass the `validate` gate.
- Production-impacting schema, breaking architecture, security, Layer‑1
  provisioning, and visible Founder UX remain **approval gates**.

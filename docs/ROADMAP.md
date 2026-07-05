# AIOS Platform — Roadmap

The AIOS vision: provision **autonomous companies** (Harmony + Julius + Ledger +
AI Workforce) on ONE Universal Capability Runtime, specialized per company by a
Company Context Envelope — multi-company, portable, self-improving, and
marketplace-extensible.

Governance is permanent. Autonomous execution proceeds continuously and only
stops for the gates: Founder approval · production-impacting schema changes ·
breaking architectural decisions · security concerns · required Layer‑1
provisioning · visible Founder UX previews. **Zero regressions.**

---

## 🏛️ Ratified foundations (permanent — 2026-07-05)
See `docs/CONSTITUTION_HISTORY.md`. Extend, never regress:
**Marketplace Engine · Marketplace Persistence · Company Templates · Portable
Company · Enterprise Auto-Provisioning · Landing Experience · Marketplace
Storefront** (`/harmony/marketplace`, PR #348).

Launch readiness is tracked in `docs/AIOS_V1_READINESS.md` and reported at the
end of every milestone report.

---

## Top-level milestones

### 🟢 Foundation (shipped / on `main`)
- **Universal Capability Runtime** — types, retry, capabilities, health, telemetry, governance `authorize` hook.
- **Provider clients (10):** GitHub, Slack, Notion, Linear, Discord, Jira, Google Drive, HubSpot, Gmail, Google Calendar.
- **Company Context Envelope** — 30-section identity (config-only; no tokens).
- **Julius** (company brain), **Ledger** (AI CFO), **Digital Twin** (derived operating model).
- **Founder Experience** — Command Center, AI Workforce HQ, Executive/Explainability dashboard, uploads, branding, executive chat; **landing experience LIVE**.
- **AIOS Marketplace** — engine + 12 categories + 10 Company Templates; **persistence LIVE** (items/versions/ratings/installations + RLS); install/update/rollback/uninstall server actions wired.
- **Portable Company** — export / import / backup / clone / deploy (secret-free bundle).
- **Enterprise Auto-Provisioning** — `provisionCompanyFromTemplate` (template → configured company via the envelope + Julius seeding).
- **Marketplace Storefront** — `/harmony/marketplace`, 12 categories, full item-card anatomy + install/update/rollback/deploy (PR #348, ratified).
- **Multi-Company OS core.**
- **Company Builder + Deployment Experience** — `/harmony/build` (PR #350, ratified); **Marketplace in nav** (PR #351).

### 🔵 Launch-First — Founder Beta (in progress)
- **Marketplace content seeding** — 10 templates + departments/skills/packs as public items (service-role; needs platform publisher identity).
- **Marketplace visual experience** — hero image, estimated cost, company size, dashboards, screenshots on template cards.
- **Founder Beta hardening** — validate the full create→deploy→access→export journey end-to-end.

### 🟡 Continuing
- **Provider clients (remaining):** Google Docs/Sheets/Meet, Microsoft Outlook/Teams/OneDrive, Salesforce, Dropbox, Box, Browserbase, Stagehand — inherit the runtime.
- **Multi-Company OS** founder interface (operate multiple companies from one account).
- **Digital Twin** — simulation, forecasting, operational + risk prediction, scenario analysis, strategic planning.
- **Ledger** — investor reporting, accounting integrations, cash forecasting, budget variance, executive financial reporting.
- **Julius** — decision history, institutional best practices, semantic retrieval, relationship intelligence.

---

## Layer‑1 (Founder-handled) — blocks live external validation only
`TOKEN_ENCRYPTION_KEY` in Vercel · provider OAuth apps · redirect URIs. All
runtime/provider/marketplace/portability code builds and is CI-green without them.

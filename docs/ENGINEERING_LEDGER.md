# AIOS Engineering Ledger

Chronological record of meaningful engineering milestones, decisions, and
lessons. Doubles as durable **Julius engineering memory** (see the tagged
entries below) so institutional knowledge survives across sessions.

---

## 2026-07-05 — Platform foundations RATIFIED (permanent) + Marketplace/Portable/Provisioning live

Founder ratified five capabilities as **permanent AIOS platform foundations**
(see `docs/CONSTITUTION_HISTORY.md`; Julius entry `44351089-2030-4cd7-9844-f942c133031d`).

### Shipped to `main` (this arc)
- **#342 — Marketplace engine + Portable Company cores** (additive, pure). `src/lib/marketplace/` + `src/lib/company/portable-company.ts`.
- **#343 — 12 storefront categories + 10 Company Templates + Portable Company backup/clone/deploy.** `categories.ts`, `templates/` (10 blueprints), `hashBundle`/`validateBundle`. 91 marketplace unit tests.
- **#344 — Landing redesign (Founder-approved, live).** `FeatureShowcase` features Marketplace, Portable Company, Autonomous Provisioning, Company Templates; new bilingual `marketing-features` catalog merged via `request.ts`.
- **#345 — Marketplace persistence LIVE.** Migration `marketplace_persistence` (prod): items/versions/ratings/installations + RLS (owner-scoped + public-read for verified). `persistence.ts` + `actions.ts` wire approved `InstallPlan`s to owner-scoped writes; server-only, kept out of the pure barrel.
- **#346 — Enterprise auto-provisioning.** `provisionCompanyFromTemplate` composes `upsertEnvelope` + `juliusRemember` to turn a template into a configured company.

### Held for Founder preview (visible UX)
- Marketplace **storefront UI**, **Company Deployment Experience**, **Company Builder** (5-step onboarding), and the company-creation UI that calls the provisioner.

### Follow-ups (non-gated but sequenced)
- Seed the 10 templates (+ departments/skills/packs) as public marketplace items via the service-role path (needs the platform publisher identity).
- Record provisioned marketplace assets in `company_installations`.

---

### 🧠 Julius engineering memory (kind: `decision` / `knowledge`)

- **[decision] Mirror prod RLS before adding schema.** Inspected `pg_policies`/columns first; company-scoped tables carry `user_id` and use `auth.uid() = user_id`. Marketplace tables mirror that, extended only with a public-read exception; public-publish/verify is a privileged service-role path so users can't self-publish. Never guess RLS on a production schema change.
- **[knowledge] Compose existing writers; don't duplicate persistence.** Enterprise provisioning reuses `upsertEnvelope` (idempotent, owner-scoped) + `juliusRemember` rather than new tables — additive, inert, consistent with `provisionWorkforce`.
- **[knowledge] i18n is split per-namespace.** `messages/<ns>/{locale}.json` catalogs merged in `src/i18n/request.ts`; the base parity gate (`i18n-parity.mjs`) checks only `messages/{en,es}.json`. New marketing/UI copy goes in a dedicated catalog; the build prerender is the real check that every key resolves.
- **[decision] Visible UX ships as a held preview.** Storefront/deployment/builder UIs are built CI-green and held for Founder sign-off, never merged autonomously.

---

## 2026-07-05 (earlier) — Founder Experience previews live; Marketplace + Portable Company cores landed

### Shipped to `main`
- **#339 — Workforce HQ regression FIXED.** An earlier PR (#330 "AI Workforce Directory") had *replaced* the pre-existing rich Workforce HQ page (164 add / 355 del) instead of adding beside it. Restored the original verbatim (live A2A status board, per-agent task/objective/approval detail, dispatch dialog, activity feed). No loss — the Digital Twin + Ledger content lives on `/harmony/executive` (#331, a clean add).
- **#340 — Nav wiring (Founder-approved).** Founder sidebar now surfaces `/harmony/executive` (Executive/Explainability, P13) and `/settings/branding` (P6); `nav.executive` / `nav.branding` i18n keys added in en + es (parity preserved).
- **#341 — Executive chat redesign (Founder-approved).** Rich markdown (headings, emphasis, inline code, fenced code blocks with copy, GFM tables, lists, blockquotes, safe links) via a dependency-free, unit-tested parser rendered as React elements (no `dangerouslySetInnerHTML`); conversation search; localStorage bookmarks. Preserves streaming + `runOperator` fallback + proposals + all prior behavior.

### Verification loop
Merged only on green CI (`validate`: lint → typecheck → test → i18n:check → build) + Vercel build. Pure logic unit-tested locally before push. i18n parity verified programmatically.

- **[decision] Zero-regression restoration over convenience.** When a page/module already exists, ADD beside it — never replace. #330 replaced the Workforce HQ; #339 restored it verbatim while keeping the new Executive Dashboard.
- **[knowledge] One universal model per marketplace.** All catalogs share ONE `MarketplaceItem` shape distinguished by `kind`.
- **[knowledge] A company IS its Envelope + brain + skills.** Portable Company = the Company Context Envelope + Julius memory + skills + derived Digital Twin/Ledger. Config + knowledge only — never secrets.
- **[decision] Diagnose CI failures against real types.** Vercel-green + `unstable` mergeable-state ⇒ investigate lint/test, not build.

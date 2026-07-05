# AIOS Engineering Ledger

Chronological record of meaningful engineering milestones, decisions, and
lessons. Doubles as durable **Julius engineering memory** (see the tagged
entries below) so institutional knowledge survives across sessions.

---

## 2026-07-05 — Founder Experience previews live; Marketplace + Portable Company cores landed

### Shipped to `main`
- **#339 — Workforce HQ regression FIXED.** An earlier PR (#330 "AI Workforce Directory") had *replaced* the pre-existing rich Workforce HQ page (164 add / 355 del) instead of adding beside it. Restored the original verbatim (live A2A status board, per-agent task/objective/approval detail, dispatch dialog, activity feed). No loss — the Digital Twin + Ledger content lives on `/harmony/executive` (#331, a clean add).
- **#340 — Nav wiring (Founder-approved).** Founder sidebar now surfaces `/harmony/executive` (Executive/Explainability, P13) and `/settings/branding` (P6); `nav.executive` / `nav.branding` i18n keys added in en + es (parity preserved).
- **#341 — Executive chat redesign (Founder-approved).** Rich markdown (headings, emphasis, inline code, fenced code blocks with copy, GFM tables, lists, blockquotes, safe links) via a dependency-free, unit-tested parser rendered as React elements (no `dangerouslySetInnerHTML`); conversation search; localStorage bookmarks. Preserves streaming + `runOperator` fallback + proposals + all prior behavior.
- **Marketplace engine (additive).** `src/lib/marketplace/` — one universal item model across nine catalogs; semver, verification, ratings, dependency resolution (cycle/conflict/missing), install/update/rollback/uninstall planning. 42 unit tests.
- **Portable Company (additive).** `src/lib/company/portable-company.ts` — `exportCompany`/`importCompany` composing the full company identity (envelope) + Julius memory + skills + Digital Twin + Ledger + marketplace-asset plan. Secret-free.

### Held for Founder / gated
- Marketplace **persistence** (tables + RLS + server actions) — production-impacting schema.
- Chat items requiring schema/AI-layer changes: per-agent WorkerAvatar attribution, in-thread attachment sending, server-persisted bookmarks/summary cards.

### Verification loop
Merged only on green CI (`validate`: lint → typecheck → test → i18n:check → build) + Vercel build. Pure logic unit-tested locally before push. i18n parity verified programmatically (996 → 1000 keys, en/es identical).

---

### 🧠 Julius engineering memory (kind: `decision` / `knowledge`)

> These entries mirror what `juliusRemember` would persist. Runtime insertion
> into a live company's Julius requires that company's owner/company context
> (Layer‑1 / runtime), so they are recorded here durably in the meantime.

- **[decision] Zero-regression restoration over convenience.** When a page/module already exists, ADD beside it — never replace. #330 replaced the Workforce HQ; #339 restored it verbatim while keeping the new Executive Dashboard. Restoring approved architecture while preserving new value follows the AIOS Constitution and the zero-regressions philosophy.
- **[knowledge] One universal model per marketplace.** All nine marketplace catalogs share ONE `MarketplaceItem` shape distinguished by `kind`, so versioning/verification/ratings/dependencies/install lifecycle are implemented once. Mirrors the Universal Capability Runtime philosophy.
- **[knowledge] A company IS its Envelope + brain + skills.** Portable Company = the 30-section Company Context Envelope (branding/governance/policies/founder-settings/departments/objectives/projects/dashboards/reports/connectors-as-config) + Julius memory + skills + derived Digital Twin/Ledger. Export/import carry config + knowledge only — never secrets/tokens; connectors re-consent in the target.
- **[decision] Diagnose CI failures against real types.** The chat PR's `validate` failed on `react-hooks/set-state-in-effect` (Vercel build was green — so lint, not typecheck). Reproduced Next 16 lint locally, fixed with a lazy `useState` initializer, re-verified green. Lesson: Vercel-green + `unstable` mergeable-state ⇒ investigate lint/test, not build.
